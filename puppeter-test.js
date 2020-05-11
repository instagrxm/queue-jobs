const puppeteer = require('puppeteer');
const iPhone = puppeteer.devices['iPhone 6'];
const iPadPro = puppeteer.devices['iPad Pro'];

async function f1(browser) {
  const page = await browser.newPage();
  await page.emulate(iPhone);
  await page.goto('https://google.com/');
  const title = await page.title();
  await page.screenshot({
    path: title + '.png',
    fullPage: true
  });
}

async function f2(browser) {
  const page = await browser.newPage();
  await page.emulate(iPadPro);
  await page.goto('https://aws.com/');
  const title = await page.title();
  await page.screenshot({
    path: title + '.png',
    fullPage: true
  });
}

async function main() {
  const browser = await puppeteer.launch();
  await Promise.all([f1(browser), f2(browser)]);
  await browser.close();
}

main()
  .then(() => console.log('done'))
  .catch(console.error);
