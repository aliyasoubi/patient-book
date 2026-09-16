// Dev-server proxy for the API. `API_PORT` lets the preview pair in
// .claude/launch.json (and anyone whose 3000 is taken) run on another port.
const target = `http://localhost:${process.env.API_PORT ?? 3000}`;

export default {
  '/api': { target, secure: false, changeOrigin: true },
};
