const axios = require('axios');
const Promise = require('bluebird');
const converter = require('json-2-csv');
const btoa = require('btoa');
const fs = require('fs');

const config = require('./config')

const credentials = {
  user: config.user,
  personalToken: config.personalToken
};

const dates = { start: '01/01/2020', end: '01/31/2020' };

const TEAM_PROJECTS = config.teamsList;

const URL_ITENS = `https://dev.azure.com/${config.account}/${config.defaultProject}/${config.defaultTeam}/_apis/wit/wiql?api-version=5.1`;
const URL_WORKITENS = `https://dev.azure.com/${config.account}/${config.defaultProject}/_apis/wit/workitemsbatch?api-version=5.1`;
const MAX_LENGTH = 200;

const QUERY_ITENS = "Select [System.Id] From WorkItems Where [System.WorkItemType] IN (\'Task\', \'Bug\') AND [State] <> \'Removed\' AND (([Microsoft.VSTS.Common.ClosedDate] >= \'%START%\' AND [Microsoft.VSTS.Common.ClosedDate] <= \'%END%\') OR ([Microsoft.VSTS.Common.ResolvedDate] >= \'%START%\' AND [Microsoft.VSTS.Common.ResolvedDate] <= \'%END%\')) AND [System.TeamProject] = '%TEAM%'";

const FIELDS = [
  "System.Id",
  "System.WorkItemType",
  "System.Title",
  "System.AssignedTo",
  "System.State",
  "System.IterationPath",
  "Microsoft.VSTS.Scheduling.OriginalEstimate",
  "Microsoft.VSTS.Scheduling.CompletedWork"
];

const auth = `Basic ${btoa(credentials.user.concat(':').concat(credentials.personalToken))}`;

function getIds(team) {
  return new Promise((resolve, reject) => {
    return axios({
      url: URL_ITENS,
      data: {
        "query": QUERY_ITENS
          .replace(/%START%/g, dates.start)
          .replace(/%END%/g, dates.end)
          .replace(/%TEAM%/g, team)
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth
      },
      method: 'POST'
    }).then(res => {
      resolve(res.data.workItems.map(wi => wi.id));
    }).catch(err => {
      reject(err);
    });
  });
}

function getWorkItems(ids) {
  return new Promise((resolve, reject) => {
    return axios({
      url: URL_WORKITENS,
      data: {
        "ids": ids,
        "fields": FIELDS
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth
      },
      method: 'POST'
    }).then(res => {
      resolve(res.data.value.map(item => {
        return {
          'ID': item.fields['System.Id'],
          'Work Item Type': item.fields['System.WorkItemType'],
          'Title': item.fields['System.Title'],
          'Assigned To': item.fields['System.AssignedTo'] ? item.fields['System.AssignedTo'].displayName : null,
          'State': item.fields['System.State'],
          'Iteration Path': item.fields['System.IterationPath'],
          'Original Estimate': item.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'],
          'Completed Work': item.fields['Microsoft.VSTS.Scheduling.CompletedWork'],
        }
      }));
    }).catch(err => {
      reject(err);
    });
  });
}

console.log('1 - Iniciando');

Promise.reduce(TEAM_PROJECTS, (total, team, index, length) => {
  console.log(`2 - Recuperando IDs do projeto ${team} (${index + 1}/${length})`);

  return getIds(team).then(wiIds => {
    return total.concat(wiIds);
  });
}, [])
  .then(ids => {
    console.log('3 - Particionando IDs');

    let idsBatch = [];

    if (ids && ids.length) {
      while (ids.length > 0) {
        idsBatch.push(ids.splice(0, MAX_LENGTH));
      }
    }

    return idsBatch;
  })
  .then(batches => {
    return Promise.reduce(batches, (totalWI, batch, index, length) => {
      console.log(`4 - Buscano WorkItems (${index + 1}/${length})`);
      return getWorkItems(batch).then(wi => {
        return totalWI.concat(wi);
      })
    }, []);
  })
  .then(workItems => {
    console.log('5 - Gerando CSV');
    converter.json2csv(workItems, (err, csv) => {
      if (err) {
        throw err;
      }

      const queryDateArray = dates.start.split('/');
      const fileName = `out/${queryDateArray[2]}.${queryDateArray[0]}_Tasks.csv`;

      fs.writeFileSync(fileName, csv, { encoding: 'latin1' });

      console.log(`6 - Arquivo gerado: ${fileName}`);
    }, {
      emptyFieldValue: ''
    });
  })
  .catch(err => {
    throw err;
  });