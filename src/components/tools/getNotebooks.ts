import { lsNotebooks } from "@/api";

export async function getNotebooks(plugin: any) {
  const fetchNotebooks = await lsNotebooks();
  const notebooks = fetchNotebooks.notebooks;
  return notebooks;
};
