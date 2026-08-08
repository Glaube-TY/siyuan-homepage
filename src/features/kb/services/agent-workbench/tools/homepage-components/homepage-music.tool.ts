import { z } from "zod";
import type { ToolContract, ToolResult } from "../../contracts/tool-contract";
import { getNotebrainPlugin } from "../../storage/notebrain-plugin-storage";
import {
  MusicPlayerRuntimeUnavailableError,
  addTrackToHomepageCloudPlaylist,
  controlHomepageMusicPlayback,
  createHomepageCloudPlaylist,
  deleteHomepageCloudPlaylist,
  getHomepageMusicStatus,
  listHomepageCloudPlaylists,
  removeTrackFromHomepageCloudPlaylist,
  renameHomepageCloudPlaylist,
  searchHomepageCloudMusic,
  setHomepageCloudFavorite,
} from "@/components/utils/widgetBlock/widget/musicPlayer/musicPlayerAgentService";
import { alwaysAvailable, homepageComponentFailure } from "./homepage-component-tool-utils";

const emptySchema = z.object({}).strict();
const searchSchema = z.object({ query: z.string().trim().min(1).max(200), type: z.enum(["song", "artist", "album"]).default("song"), limit: z.number().int().min(1).max(50).default(20) }).strict();
const playlistIdSchema = z.object({ playlistId: z.string().trim().min(1) }).strict();
const createPlaylistSchema = z.object({ name: z.string().trim().min(1).max(200), trackIds: z.array(z.string().trim().min(1)).max(500).default([]) }).strict();
const renamePlaylistSchema = playlistIdSchema.extend({ name: z.string().trim().min(1).max(200) }).strict();
const playlistTrackSchema = playlistIdSchema.extend({ trackId: z.string().trim().min(1) }).strict();
const trackSchema = z.object({ trackId: z.string().trim().min(1) }).strict();
const seekSchema = z.object({ seconds: z.number().finite().nonnegative() }).strict();
const volumeSchema = z.object({ volume: z.number().finite().min(0).max(1) }).strict();

function actionTool<T>(name: string, schema: z.ZodType<T>, readOnly: boolean, execute: (input: T) => Promise<unknown>, riskLevel: "low" | "medium" | "high" = "medium"): ToolContract {
  return { name: `homepage_music_${name}`, title: name, description: `homepage_music.${name}`, inputSchema: schema, readOnly, safety: readOnly ? { readOnly: true } : { readOnly: false, canWrite: true, requiresConfirmation: true, riskLevel }, source: "builtin", providerVisible: false, availability: alwaysAvailable,
    async execute(_ctx, raw): Promise<ToolResult> {
      try { return { ok: true, data: await execute(schema.parse(raw)) }; }
      catch (error) {
        if (error instanceof MusicPlayerRuntimeUnavailableError) return { ok: false, data: null, error: { code: "music_player_runtime_unavailable", message: error.message, recoverable: true, hint: "请先在主页挂载并初始化音乐播放器。" } };
        return homepageComponentFailure(error, `music_${name}_failed`, `音乐操作 ${name} 失败。`);
      }
    }, summarizeResult: (result) => result.ok ? `音乐 ${name} 完成。` : result.error?.message ?? "音乐操作失败。" };
}

export function createHomepageMusicActionTools(): Array<{ action: string; tool: ToolContract }> {
  const plugin = () => getNotebrainPlugin();
  const runtime = (action: "pause" | "resume" | "next" | "previous") => actionTool(action, emptySchema, false, async () => controlHomepageMusicPlayback(action), "low");
  return [
    { action: "status", tool: actionTool("status", emptySchema, true, async () => getHomepageMusicStatus(plugin())) },
    { action: "search", tool: actionTool("search", searchSchema, true, async ({ query, type, limit }) => searchHomepageCloudMusic(plugin(), query, type, limit)) },
    { action: "list_playlists", tool: actionTool("list_playlists", emptySchema, true, async () => listHomepageCloudPlaylists(plugin())) },
    { action: "create_playlist", tool: actionTool("create_playlist", createPlaylistSchema, false, async ({ name, trackIds }) => createHomepageCloudPlaylist(plugin(), name, trackIds)) },
    { action: "rename_playlist", tool: actionTool("rename_playlist", renamePlaylistSchema, false, async ({ playlistId, name }) => renameHomepageCloudPlaylist(plugin(), playlistId, name)) },
    { action: "delete_playlist", tool: actionTool("delete_playlist", playlistIdSchema, false, async ({ playlistId }) => deleteHomepageCloudPlaylist(plugin(), playlistId), "high") },
    { action: "add_to_playlist", tool: actionTool("add_to_playlist", playlistTrackSchema, false, async ({ playlistId, trackId }) => addTrackToHomepageCloudPlaylist(plugin(), playlistId, trackId)) },
    { action: "remove_from_playlist", tool: actionTool("remove_from_playlist", playlistTrackSchema, false, async ({ playlistId, trackId }) => removeTrackFromHomepageCloudPlaylist(plugin(), playlistId, trackId)) },
    { action: "favorite", tool: actionTool("favorite", trackSchema, false, async ({ trackId }) => setHomepageCloudFavorite(plugin(), trackId, true)) },
    { action: "unfavorite", tool: actionTool("unfavorite", trackSchema, false, async ({ trackId }) => setHomepageCloudFavorite(plugin(), trackId, false)) },
    { action: "play", tool: actionTool("play", trackSchema, false, async ({ trackId }) => controlHomepageMusicPlayback("play", trackId), "low") },
    { action: "pause", tool: runtime("pause") },
    { action: "resume", tool: runtime("resume") },
    { action: "next", tool: runtime("next") },
    { action: "previous", tool: runtime("previous") },
    { action: "seek", tool: actionTool("seek", seekSchema, false, async ({ seconds }) => controlHomepageMusicPlayback("seek", seconds), "low") },
    { action: "set_volume", tool: actionTool("set_volume", volumeSchema, false, async ({ volume }) => controlHomepageMusicPlayback("set_volume", volume), "low") },
  ];
}
