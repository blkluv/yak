import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { SimpleAudioTest } from '@/components/SimpleAudioTest'; // ← ADD THIS IMPORT

export function AppRouter() {
  return <RouterProvider router={router} />;
}

export default AppRouter;
