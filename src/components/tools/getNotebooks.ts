import { lsNotebooks } from "@/api";

export async function getNotebooks(_plugin: any) {
  const fetchNotebooks = await lsNotebooks();
  const notebooks = fetchNotebooks.notebooks;
  return notebooks;
};
