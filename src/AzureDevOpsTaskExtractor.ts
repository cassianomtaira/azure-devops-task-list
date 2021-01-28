import axios from 'axios';
import moment from 'moment';
import converter = require('json-2-csv');
import fs = require('fs');
import btoa from 'btoa';
import { IConfigHelper } from './Helpers/ConfigHelper';
import { ArrayUtils } from './Utils/ArrayUtils';

export interface ICredentials {
  user: string;
  personalToken: string;
}

export interface IRange {
  start: string;
  end: string;
}

export class AzureDevOpsTaskExtractor {
  private projectsList: string[] = [];
  private account: string;
  private defaultProject: string;
  private defaultTeam: string;

  private urlItems: string;
  private urlWorkItems: string;
  private urlProjectsList: string;
  private batchSize: number;
  private queryClosedItens: string;
  private queryResolvedItens: string;
  private workItemFields: string[];

  private auth: string;

  private credentials: ICredentials;
  private dates: IRange;

  constructor(config: IConfigHelper, start?: string, end?: string) {
    this.projectsList = config.projectsList;
    this.account = config.account;
    this.defaultProject = config.defaultProject;
    this.defaultTeam = config.defaultTeam;

    this.credentials = { user: config.user, personalToken: config.personalToken };

    this.urlItems = `https://dev.azure.com/${this.account}/${this.defaultProject}/${this.defaultTeam}/_apis/wit/wiql?api-version=5.1`;
    this.urlWorkItems = `https://dev.azure.com/${this.account}/${this.defaultProject}/_apis/wit/workitemsbatch?api-version=5.1`;
    this.urlProjectsList = `https://dev.azure.com/${this.account}/_apis/projects?api-version=6.0`;
    this.batchSize = 200;

    this.queryClosedItens = 'Select [System.Id] From WorkItems Where [System.WorkItemType] IN (\'Task\', \'Bug\') AND [State] <> \'Removed\' AND [Microsoft.VSTS.Common.ClosedDate] >= \'%START%\' AND [Microsoft.VSTS.Common.ClosedDate] <= \'%END%\' AND [System.TeamProject] = \'%TEAM%\'';
    this.queryResolvedItens = 'Select [System.Id] From WorkItems Where [System.WorkItemType] IN (\'Task\', \'Bug\') AND [State] <> \'Removed\' AND [Microsoft.VSTS.Common.ResolvedDate] >= \'%START%\' AND [Microsoft.VSTS.Common.ResolvedDate] <= \'%END%\' AND [System.TeamProject] = \'%TEAM%\'';

    this.workItemFields = [
      "System.Id",
      "System.WorkItemType",
      "System.Title",
      "System.AssignedTo",
      "System.State",
      "System.IterationPath",
      "Microsoft.VSTS.Scheduling.OriginalEstimate",
      "Microsoft.VSTS.Scheduling.CompletedWork"
    ];

    this.dates = start && end
      ? { start, end }
      : { start: moment().startOf('month').format('MM/DD/YYYY'), end: moment().endOf('month').format('MM/DD/YYYY') };
      
    this.auth = `Basic ${btoa(this.credentials.user.concat(':').concat(this.credentials.personalToken))}`;
  }

  private async getIds(team: string, query: string): Promise<number[]> {
    const res = await axios({
      url: this.urlItems,
      data: {
        "query": query
          .replace(/%START%/g, this.dates.start)
          .replace(/%END%/g, this.dates.end)
          .replace(/%TEAM%/g, team)
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.auth
      },
      method: 'POST'
    });

    return res.data.workItems.map((wi: any) => wi.id);
  }

  private async getWorkItems(ids: number[]): Promise<any[]> {
    const ret = await axios({
      url: this.urlWorkItems,
      data: {
        "ids": ids,
        "fields": this.workItemFields
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.auth
      },
      method: 'POST'
    });

    return await ret.data.value.map((item: any) => {
      return {
        'ID': item.fields['System.Id'],
        'Work Item Type': item.fields['System.WorkItemType'],
        'Title': item.fields['System.Title'].replace(/[\t\n]/g, ''),
        'Assigned To': item.fields['System.AssignedTo'] ? item.fields['System.AssignedTo'].displayName : null,
        'State': item.fields['System.State'],
        'Iteration Path': item.fields['System.IterationPath'],
        'Original Estimate': item.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'],
        'Completed Work': item.fields['Microsoft.VSTS.Scheduling.CompletedWork'],
      }
    });
  }

  private async getOrganizationProjects(): Promise<string[]> {
    const ret = await axios({
      url: this.urlProjectsList,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.auth
      },
      method: 'GET'
    });

    return await ret.data.value.map((item: any) => item.name);
  }

  public async run() {
    console.log('1 - Iniciando');

    if (this.projectsList === null || this.projectsList.length === 0) {
      this.projectsList = await this.getOrganizationProjects();
    }

    let ids: number[] = [];

    await ArrayUtils.asyncForEach(this.projectsList, async (team: string, index: number, array: string[]) => {
      console.log(`2 - Recuperando IDs de tarefas do projeto ${team} (${index + 1}/${array.length})`);

      ids = ids.concat(await this.getIds(team, this.queryClosedItens));
      ids = ids.concat(await this.getIds(team, this.queryResolvedItens));
    });

    console.log('3 - Particionando IDs');

    let batches = [];

    if (ids && ids.length) {
      while (ids.length > 0) {
        batches.push(ids.splice(0, this.batchSize));
      }
    }

    let workItems: any[] = [];

    await ArrayUtils.asyncForEach(batches, async (batch: number[], index: number, array: string[]) => {
      console.log(`4 - Buscando WorkItems (${index + 1}/${array.length})`);

      workItems = workItems.concat(await this.getWorkItems(batch));
    });

    console.log('5 - Gerando CSV');

    let csv = await converter.json2csvAsync(workItems, { emptyFieldValue: '' });

    const queryDateArray = this.dates.end.split('/');
    const fileName = `out/${queryDateArray[2]}.${queryDateArray[0]}_Tasks.csv`;

    fs.writeFileSync(fileName, csv, { encoding: 'latin1' });

    console.log(`6 - Arquivo gerado: ${fileName}`);
  }
}