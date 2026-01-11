import { version } from '@siren/core';

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `<h1>Siren v${version}</h1><p>Project Management as Code</p>`;
}
