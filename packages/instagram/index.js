const IgApiClient = require('instagram-private-api').IgApiClient;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const _ = require('lodash');
const eachLimit = require('async/eachLimit');
const format = require('date-fns/format');
const fromUnixTime = require('date-fns/fromUnixTime');
const mkdirp = require('mkdirp');

const defaultAuthFilepath = path.join(__dirname, 'auth.json');
const defaultDownloadPath = path.join(__dirname, 'downloads');

async function ensureDirs(filepath) {
  return mkdirp(path.dirname(filepath));
}

async function saveFile(data, path) {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, JSON.stringify(data, null, ' '), (err) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// The reccomended way to use login.
// See https://github.com/dilame/instagram-private-api/blob/master/examples/session.example.ts
async function login(authFilepath = defaultAuthFilepath) {
  const ig = new IgApiClient();
  ig.state.generateDevice(process.env.IG_USERNAME);
  ig.state.proxyUrl = process.env.IG_PROXY;

  // This function executes after every request
  ig.request.end$.subscribe(async () => {
    const serialized = await ig.state.serialize();
    delete serialized.constants; // this deletes the version info, so you'll always use the version provided by the library
    return saveFile(serialized, authFilepath);
  });

  if (fs.existsSync(authFilepath)) {
    await ig.state.deserialize(require(authFilepath));
  }
  await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
  return ig;
}

function keepUser(username) {
  return true;
  const whitelist = ['annasioi'];
  return whitelist.indexOf(username) > 0;
}

async function getStories(ig) {
  const wholeReelsTray = await ig.feed.reelsTray().request();
  return Promise.all(
    wholeReelsTray.tray
      .filter((tray) => keepUser(tray.user.username))
      .map(async (tray) => {
        const userStory = await ig.feed.userStory(tray.user.pk).request();
        return {
          username: tray.user.username,
          images: userStory.reel.items
            .filter((i) => i.media_type === 1 && i.image_versions2.candidates.length)
            .map((i) => ({
              url: i.image_versions2.candidates[0].url,
              taken_at: i.taken_at
            })),
          videos: userStory.reel.items
            .filter((i) => i.media_type === 2 && i.video_versions.length)
            .map((i) => ({
              url: i.video_versions[0].url,
              taken_at: i.taken_at
            }))
        };
      })
  );
}

async function downloadFile(downloadPath, url, folder, filename) {
  const p = path.resolve(__dirname, downloadPath, folder, filename);

  await ensureDirs(p);
  const writer = fs.createWriteStream(p, { flags: 'w' });
  console.log(`downloading ${url} to ${p}`);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function assetAttributes(asset) {
  const time = format(fromUnixTime(asset.taken_at), 'yyyy_MM_dd__HH_MM');
  const extension = path.extname(new URL(asset.url).pathname);
  const filename = `${time}${extension}`;
  return {
    filename
  };
}

async function downloadForUser(story, downloadPath) {
  const assets = [...story.images, ...story.videos];
  console.log(`downloading ${assets.length} assets for ${story.username}...`);
  return new Promise((resolve, reject) => {
    eachLimit(
      assets,
      10,
      (asset, callback) => {
        const { filename } = assetAttributes(asset);
        downloadFile(downloadPath, asset.url, story.username, filename)
          .then(callback)
          .catch((e) => reject(e));
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function download(stories, downloadPath = defaultDownloadPath) {
  return Promise.all(stories.map(async (story) => downloadForUser(story, downloadPath)));
}

module.exports = {
  login,
  getStories,
  download
};
