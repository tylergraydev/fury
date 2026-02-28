import "./lib/monacoSetup";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary label="Application">
    <App />
  </ErrorBoundary>,
);
