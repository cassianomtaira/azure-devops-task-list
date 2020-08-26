import config from './config.json';
import { AzureDevOpsTaskExtractor } from './AzureDevOpsTaskExtractor';

const taskExtract = new AzureDevOpsTaskExtractor(config);
taskExtract.run();