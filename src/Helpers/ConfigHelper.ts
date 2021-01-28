export interface IConfigHelper {
  user: string;
  personalToken: string;
  projectsList: string[];
  account: string;
  defaultProject: string;
  defaultTeam: string;
}

export class ConfigHelper {
  public user : string;
  public personalToken : string;
  public projectsList : string[];
  public account : string;
  public defaultProject : string;
  public defaultTeam : string;
  
  constructor() {
    this.user = process.env.USER || '';
    this.personalToken = process.env.PERSONAL_TOKEN || '';
    this.projectsList = this.parseProjectList(process.env.PROJECTS),
    this.account = process.env.ACCOUNT || '',
    this.defaultProject = process.env.DEFAULT_PROJECT || '',
    this.defaultTeam = process.env.DEFAULT_TEAM || ''
  }

  private parseProjectList(projects: string | undefined): string[] {
    if (!projects) return [];

    return projects.split(',');
  }
}