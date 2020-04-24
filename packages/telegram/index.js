const axios = require('axios');
const debug = require('debug')('telegram');

const IFTTT_TOKEN = process.env.IFTTT_TOKEN;

async function notify({ message, channel = 'tg' }) {
  if (!IFTTT_TOKEN) {
    throw new Error('Missing IFTTT_TOKEN env variable.');
  }

  const webhook = `https://maker.ifttt.com/trigger/${channel}/with/key/${IFTTT_TOKEN}`;
  const url = new URL(webhook);
  url.searchParams.append('value1', message);
  const finalURL = url.toString();

  debug(`notify telegram url: ${finalURL}`);
  return axios.get(finalURL);
}

module.exports = {
  notify
};
