// EX8.8: Vite `?worker` imports (the client tsconfig doesn't load vite/client types)
declare module '*?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
