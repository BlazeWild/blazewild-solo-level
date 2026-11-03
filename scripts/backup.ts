import { read, flush } from "../server/store.js";
await flush();
console.log(JSON.stringify(read(), null, 2));
