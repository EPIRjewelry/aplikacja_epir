/**
 * Jednoużytkowy UI: Dev-asystent (`internal-dashboard`) — Project B Operator Studio.
 * Auth: `X-Admin-Key` = `EPIR_OPERATOR_PANEL_SECRET`.
 * Agent: `X-EPIR-AGENT-PRESET` | Model: `X-Epir-Model-Variant` | Załącznik: `image_base64`.
 */
import { buildOperatorStudioHtml, buildSoloDevChatHtml } from './solo-dev-ui/build-studio-html';

/** Kanoniczna ścieżka panelu (zachowana wstecznie). */
export const SOLO_DEV_CHAT_HTML = buildSoloDevChatHtml();

/** Alias Fazy 3 — ten sam UI, osobna trasa ingress. */
export const SOLO_DEV_OPERATOR_STUDIO_HTML = buildOperatorStudioHtml();
