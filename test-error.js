const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: "new"});
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  const express = require('express');
  const app = express();
  app.use(express.static('dist'));
  const server = app.listen(3000, async () => {
    await page.goto('http://localhost:3000');
    // We need to wait for the page to load
    await page.waitForTimeout(2000);
    
    // Evaluate in browser context to click the "Configuración" button
    // It's the button with the text "Configuración" or icon
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, a'));
      const configBtn = btns.find(b => b.innerText.includes('Configuración'));
      if(configBtn) configBtn.click();
    });
    
    await page.waitForTimeout(2000);
    console.log("Done");
    server.close();
    await browser.close();
    process.exit(0);
  });
})();
