export async function getNotebooks (plugin: any) {
  const fetchNotebooks = await plugin.client.lsNotebooks();
  const notebooks = fetchNotebooks.data.notebooks;
  return notebooks;
};