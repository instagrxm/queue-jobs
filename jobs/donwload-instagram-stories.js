const Queue = require('bull');
const path = require('path');
const q = new Queue('instagram-stories');
const { login, getStories, download } = require('../packages/instagram');

if (!process.env.IG_USERNAME || !process.env.IG_PASSWORD) {
  console.log('IG_USERNAME & IG_PASSWORD env variables must be set.');
  process.exit(1);
}

q.process('instagram-stories-cron', async (job) => {
  console.log(`Processing job ${job.name} from queue ${job.queue.name}.`);

  const ig = await login();
  const stories = await getStories(ig);
  const downloadJob = await q.add(
    'instagram-stories-downloader',
    { stories },
    {
      attempts: 3,
      removeOnComplete: false,
      removeOnFail: false,
      timeout: 5 * 60 * 1000
    }
  );
  console.log(`Created job ${downloadJob.name} from queue ${downloadJob.queue.name}`);

  console.log(`Done processing job ${job.name}.`);
  return stories;
});

q.process('instagram-stories-downloader', async (job) => {
  console.log(`Processing job ${job.name} from queue ${job.queue.name}.`);

  const stories = job.data.stories;
  await download(stories, path.join(__dirname, '..', 'data', 'instagram'));
  console.log(`Done processing job ${job.name}.`);
});

const addCronJob = async () =>
  q.add(
    'instagram-stories-cron',
    {},
    {
      attempts: 5,
      removeOnComplete: false,
      removeOnFail: false,
      timeout: 30 * 1000, // 30sec
      repeat: {
        cron: '15 10 * *'
      }
    }
  );

addCronJob()
  .then((job) => console.log(`Created job ${job.name} from queue ${job.queue.name}.`))
  .catch(console.error);
