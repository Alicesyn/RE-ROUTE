/**
 * Environment detection utility.
 * Senses whether the application is running in local development (Vite dev server)
 * or in a Vercel deployment (production or preview with serverless functions available).
 */

export const isLocalDev = (): boolean => {
  // Allow explicit override (e.g., if using `vercel dev` locally to test serverless functions)
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_FORCE_VERCEL_API === "true") {
    return false;
  }

  // Vite development mode flag (true when running `npm run dev` / `vite`)
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    return true;
  }

  // Fallback checks for browser hostname/port
  if (typeof window !== "undefined") {
    const { hostname, port } = window.location;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      port === "5173" ||
      port === "4173"
    ) {
      return true;
    }
  }

  return false;
};

export const isVercelDeployment = (): boolean => {
  return !isLocalDev();
};
