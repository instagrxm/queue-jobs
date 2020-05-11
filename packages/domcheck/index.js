const puppeteer = require('puppeteer');
const _ = require('lodash');

async function _queryPage(browser, url, waitForSelector, timeout = 40000, onDocument) {
  const page = await browser.newPage();
  await page.goto(url, { timeout, waitUntil: 'domcontentloaded' });
  await page.waitForSelector(waitForSelector);
  await page.evaluate(onDocument, waitForSelector);
}

async function query({ url, waitForSelector, timeout = 40000, onDocument }) {
  const browser = await puppeteer.launch({ headless: true });
  const result = await _queryPage(browser, url, waitForSelector, timeout, onDocument);
  await browser.close();
  return result;
}

async function queryMulti(pageConfig) {
  const browser = await puppeteer.launch({ headless: true });
  const results = await Promise.all(
    pageConfig.map(async ({ url, waitForSelector, timeout, onDocument }) =>
      _queryPage(browser, url, waitForSelector, timeout, onDocument)
    )
  );
  await browser.close();
  return results;
}

const defaultConfig = {
  historyDir: 'history',
  timeout: 40000, // ms
  onDocument: (selector) => {
    const nodeList = document.querySelectorAll(selector);
    return nodeList[0] && nodeList[0].innerText.trim();
  }
};

async function domcheck(config) {
  const { name, url, waitForSelector, onDocument, timeout, history, historyDir, notify } = _.merge(
    defaultConfig,
    config
  );
  const historyPath = history || `${name}.csv`;

  if (_.some([name, url, onDocument, notify], (x) => _.isNil(x))) {
    throw new Error('missing parameters');
  }

  const text = await query(url, waitForSelector, timeout, onDocument);
  if (_.isEmpty(text)) {
    throw new Error(`query result is empty`);
  }

  const entries = await getHistory(historyDir, historyPath);
  const lastEntry = _.last(entries);
  console.log('last entry:', lastEntry);

  entries.push({ text, timestamp: Date.now() });
  const promises = [setHistory(historyDir, historyPath, entries)];

  if (!lastEntry || (lastEntry && lastEntry.text !== text)) {
    console.log('notifying change:', text);
    promises.unshift(notify(name, text, null));
  }

  return Promise.all(promises);
}

module.exports = domcheck;
