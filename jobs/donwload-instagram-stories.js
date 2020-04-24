require('dotenv').config();
const _ = require('lodash');
const Queue = require('bull');
const path = require('path');
const q = new Queue('instagram-stories');
const { login, getStories, downloadStories } = require('../packages/instagram');
const { uploadFiles } = require('../packages/storage/azure');
const { notify } = require('../packages/telegram');

/*
|--------------------------------------------------------------------------
| Job Constants
|--------------------------------------------------------------------------
*/
const JOB_NAME = 'download-instagram-stories';
const INSTAGRAM_DOWNLOAD_PATH = path.join(__dirname, '..', 'data', 'instagram');
const debug = require('debug')(JOB_NAME);

/*
|--------------------------------------------------------------------------
| Catch queue errors and failed jobs
|--------------------------------------------------------------------------
*/
q.on('error', (error) => debug('error', error));
q.on('failed', async (job, error) => {
  console.error(`failed`, job.name, error);
  await notify({ message: `🚨 Job "${JOB_NAME}" failed: \`${error.message}\`` });
});

/*
|--------------------------------------------------------------------------
| Job handlers
|--------------------------------------------------------------------------
*/
async function handleFetchStories(job) {
  debug(`Processing job ${job.name} from queue ${job.queue.name}.`);
  const ig = await login();
  const stories = await getStories(ig);
  const downloadJob = await createDownloadStoriesJob({ stories });
  debug(
    `Created job ${downloadJob.name} from queue ${downloadJob.queue.name} %O`,
    downloadJob.toJSON()
  );
  debug(`Done processing job ${job.name}.`);
  return stories;
}

async function handleDownloadStories(job) {
  debug(`Processing job ${job.name} from queue ${job.queue.name}.`);
  const stories = job.data.stories;
  const downloads = await downloadStories(stories, INSTAGRAM_DOWNLOAD_PATH);
  const uploadJob = await createUploadStoriesJob({ downloads: _.flatten(downloads) });
  debug(`Created job ${uploadJob.name} from queue ${uploadJob.queue.name} %O`, uploadJob.toJSON());
  debug(`Done processing job ${job.name}.`);
  return downloads;
}

async function handleUploadStories(job) {
  const makeUploadPath = (filepath) => filepath.split('/').slice(-2).join('/');

  debug(`Processing job ${job.name} from queue ${job.queue.name}.`);
  const downloadPaths = job.data.downloads;
  await uploadFiles(downloadPaths, 'instagram', 5, makeUploadPath);
  debug(`Done processing job ${job.name}.`);
}

/*
|--------------------------------------------------------------------------
| Job creators
|--------------------------------------------------------------------------
*/
async function createFetchStoriesCronJob() {
  return q.add(
    'instagram-stories-cron',
    {},
    {
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 0,
      timeout: 30 * 1000, // 30sec
      repeat: {
        cron: '15 10 * * *', // every day at 10:15am
        tz: 'America/Los_Angeles'
      }
    }
  );
}

async function createDownloadStoriesJob(data) {
  return q.add('instagram-stories-downloader', data, {
    removeOnComplete: false,
    removeOnFail: false,
    timeout: 30 * 60 * 1000 // 30min
  });
}

async function createUploadStoriesJob(data) {
  return q.add('instagram-stories-uploader', data, {
    removeOnComplete: false,
    removeOnFail: false,
    timeout: 30 * 60 * 1000 // 30min
  });
}

/*
|--------------------------------------------------------------------------
| Main
|--------------------------------------------------------------------------
*/
async function main() {
  q.process('instagram-stories-cron', handleFetchStories);
  q.process('instagram-stories-downloader', handleDownloadStories);
  q.process('instagram-stories-uploader', handleUploadStories);

  const job = await createFetchStoriesCronJob();
  debug(`Created job ${job.name} from queue ${job.queue.name}. %O`, job.toJSON());
}

main()
  .then(() => debug('Done'))
  .catch((e) => debug('Error: ', e));
