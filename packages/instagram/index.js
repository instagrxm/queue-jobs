const IgApiClient = require('instagram-private-api').IgApiClient;
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const _ = require('lodash');
const mapLimit = require('async/mapLimit');
const format = require('date-fns/format');
const fromUnixTime = require('date-fns/fromUnixTime');
const mkdirp = require('mkdirp');
const debug = require('debug')('instagram');

const defaultAuthFilepath = path.join(__dirname, 'auth.json');
const defaultDownloadPath = path.join(__dirname, 'downloads');
const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;
const IG_PROXY = process.env.IG_PROXY;
const IG_WHITELIST = process.env.IG_WHITELIST;

/*
|--------------------------------------------------------------------------
| Private functions
|--------------------------------------------------------------------------
*/

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

function parseWhitelist() {
  let list = null;
  if (_.isString(IG_WHITELIST) && !_.isEmpty(IG_WHITELIST)) {
    list = IG_WHITELIST.split(',').replace(/ /g, '');
  }
  debug(`whitelist ${list}`);
  return list;
}

function keepUser(username, whiteList = []) {
  return _.includes(whiteList, username);
}

async function downloadFile(downloadPath, url, folder, filename) {
  const p = path.resolve(__dirname, downloadPath, folder, filename);

  await ensureDirs(p);
  const writer = fs.createWriteStream(p, { flags: 'w' });
  debug(`downloading ${url} to ${p}`);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(p));
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
  debug(`downloading ${assets.length} assets for ${story.username}...`);
  return mapLimit(assets, 10, (asset, callback) => {
    const { filename } = assetAttributes(asset);
    downloadFile(downloadPath, asset.url, story.username, filename)
      .then((downloadedPath) => callback(null, downloadedPath))
      .catch((e) => callback(e));
  });
}

/*
|--------------------------------------------------------------------------
| Public functions
|--------------------------------------------------------------------------
*/

// The reccomended way to use login.
// See https://github.com/dilame/instagram-private-api/blob/master/examples/session.example.ts
async function login(authFilepath = defaultAuthFilepath) {
  if (!IG_USERNAME || !IG_PASSWORD) {
    throw new Error('Missing env variables IG_USERNAME and IG_PASSWORD.');
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  ig.state.proxyUrl = IG_PROXY;

  // This function executes after every request
  ig.request.end$.subscribe(async () => {
    const serialized = await ig.state.serialize();
    delete serialized.constants; // this deletes the version info, so you'll always use the version provided by the library
    return saveFile(serialized, authFilepath);
  });

  if (fs.existsSync(authFilepath)) {
    await ig.state.deserialize(require(authFilepath));
  }
  await ig.account.login(IG_USERNAME, IG_PASSWORD);
  return ig;
}

async function getStories(ig) {
  const wholeReelsTray = await ig.feed.reelsTray().request();
  const whiteList = parseWhitelist();

  return Promise.all(
    wholeReelsTray.tray
      .filter((tray) => keepUser(tray.user.username, whiteList))
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

async function downloadStories(stories, downloadPath = defaultDownloadPath) {
  return Promise.all(stories.map(async (story) => downloadForUser(story, downloadPath)));
}

module.exports = {
  login,
  getStories,
  downloadStories
};
