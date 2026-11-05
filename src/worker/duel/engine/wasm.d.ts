// Workers (and @cloudflare/vite-plugin) turn `import x from "*.wasm"` into a compiled module.
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
