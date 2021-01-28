//import config from './config.json';
import dotenv from 'dotenv';
import { AzureDevOpsTaskExtractor } from './AzureDevOpsTaskExtractor';
import { ConfigHelper } from './Helpers/ConfigHelper';

dotenv.config();

const config = new ConfigHelper();
const taskExtract = new AzureDevOpsTaskExtractor(config, '12/25/2020', '01/26/2021');

taskExtract.run();