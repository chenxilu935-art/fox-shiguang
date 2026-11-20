declare module '*.jpg' {
  const dataUrl: string;
  export default dataUrl;
}

declare module '*.html' { const text: string; export default text; }
declare module '*.css' { const text: string; export default text; }
declare module '*.js' { const text: string; export default text; }

declare module '*.png' { const dataUrl: string; export default dataUrl; }
