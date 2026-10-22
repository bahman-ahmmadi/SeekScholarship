const TELEGRAM_API = "https://api.telegram.org";
const TELEGRAM_CHANNEL = "@SeekScholarship";
const TOKEN_LIFETIME_MS = 48 * 60 * 60 * 1000;
const SCHOLARSHIP_SELECT = "*,countries(name)";

const DRAFT_OPENING = "Explore this scholarship opportunity and review the official details.";

function jsonResponse(value, status = 200) {
    return Response.json(value, {
        status,
        headers: { "Cache-Control": "no-store" }
    });
}

function requireSecrets(env) {
    const required = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_WEBHOOK_SECRET",
        "TELEGRAM_ADMIN_USER_ID"
    ];
    const missing = required.filter((name) => !env[name]);
    if (missing.length) throw new Error(`Missing Worker secrets/configuration: ${missing.join(", ")}`);
}

function supabaseHeaders(env, extra = {}) {
    return {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        ...extra
    };
}

async function supabaseRequest(env, path, options = {}) {
    const base = env.SUPABASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${base}/rest/v1/${path}`, {
        ...options,
        headers: supabaseHeaders(env, options.headers || {}),
        signal: AbortSignal.timeout(12_000)
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) {}
    if (!response.ok) {
        const message = body?.message || body?.hint || `Supabase returned HTTP ${response.status}`;
        throw new Error(message.slice(0, 300));
    }
    return body;
}

async function callRpc(env, functionName, args) {
    return supabaseRequest(env, `rpc/${functionName}`, {
        method: "POST",
        body: JSON.stringify(args)
    });
}

function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}

async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

async function fetchPublishedScholarship(env, id) {
    const query = new URLSearchParams({
        select: SCHOLARSHIP_SELECT,
        id: `eq.${id}`,
        status: "eq.published",
        limit: "1"
    });
    const rows = await supabaseRequest(env, `scholarships?${query}`);
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function sourceVersion(scholarship) {
    return sha256Hex(stableJson(scholarship));
}

function dbFilter(value) {
    return encodeURIComponent(String(value));
}

async function getPostByScholarship(env, scholarshipId) {
    const query = new URLSearchParams({
        select: "id,scholarship_id,source_version,draft_text,status,generation,approval_token_hash,approval_token_expires_at,approved_by_telegram_user_id,review_chat_id,review_message_id",
        scholarship_id: `eq.${scholarshipId}`,
        limit: "1"
    });
    const rows = await supabaseRequest(env, `telegram_scholarship_posts?${query}`);
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchPost(env, post, status, values) {
    const query = `telegram_scholarship_posts?id=eq.${dbFilter(post.id)}&status=eq.${encodeURIComponent(status)}`;
    const rows = await supabaseRequest(env, query, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(values)
    });
    return Array.isArray(rows) ? rows[0] || null : null;
}

async function reserveDraft(env, scholarship, version) {
    let post = await getPostByScholarship(env, scholarship.id);
    if (!post) {
        const rows = await supabaseRequest(env, "telegram_scholarship_posts", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
                scholarship_id: String(scholarship.id),
                source_version: version,
                status: "generating",
                generation: 1
            })
        });
        if (!Array.isArray(rows) || !rows[0]) throw new Error("Could not reserve a draft record");
        return rows[0];
    }

    if (post.status === "draft" && post.source_version === version) return { ...post, alreadyDraft: true };
    if (post.status === "generating" || post.status === "approved" || post.status === "publishing" || post.status === "published" || post.status === "publish_unknown") {
        throw new Error(`This scholarship already has a ${post.status.replaceAll("_", " ")} Telegram post.`);
    }

    const updated = await patchPost(env, post, post.status, {
        status: "generating",
        source_version: version,
        draft_text: null,
        approval_token_hash: null,
        approval_token_expires_at: null,
        review_chat_id: null,
        review_message_id: null,
        last_error: null,
        generation: Number(post.generation || 0) + 1,
        updated_at: new Date().toISOString()
    });
    if (!updated) throw new Error("The Telegram draft changed while it was being prepared. Try again.");
    return updated;
}

function simpleText(value, maxLength = 350) {
    return String(value ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function postDeadline(value) {
    const text = simpleText(value, 100);
    if (!text) return "Not specified";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return text;
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "long", year: "numeric", timeZone: "UTC"
    }).format(date);
}

function makeScholarshipPost(scholarship) {
    const country = simpleText(scholarship.countries?.name, 100);
    const funding = simpleText(scholarship.funding, 120);
    const countryTag = country.replace(/[^\p{L}\p{N}_]/gu, "");
    const tags = ["#SeekScholarship"];
    if (/fully[ -]?funded/i.test(funding) && !/partial|not fully/i.test(funding)) tags.push("#FullyFunded");
    tags.push("#Scholarship");
    if (countryTag) tags.push(`#${countryTag}`);
    tags.push("#Students");

    let applyUrl = `https://seekscholarship.com/scholarship?id=${encodeURIComponent(String(scholarship.id))}`;
    try {
        const url = new URL(String(scholarship.application_url || ""));
        if (["https:", "http:"].includes(url.protocol)) applyUrl = url.href;
    } catch (_) { /* Use the scholarship details page when no valid apply URL is saved. */ }

    return [
        simpleText(scholarship.name, 220),
        "",
        `Offered by: ${simpleText(scholarship.offered_by, 160) || "Not specified"}`,
        `Degree level: ${simpleText(scholarship.degree, 120) || "Not specified"}`,
        `Scholarship coverage: ${funding || "Not specified"}`,
        `Eligible nationality: ${simpleText(scholarship.eligible_countries, 220) || "Not specified"}`,
        `Award country: ${country || "Not specified"}`,
        `Last date: ${postDeadline(scholarship.deadline)}`,
        "",
        `Apply Link: ${applyUrl}`,
        "",
        tags.join(" ")
    ].join("\n");
}

function callbackData(action, postId, token) {
    const idBase36 = BigInt(postId).toString(36);
    const prefix = action === "approve" ? "a" : action === "reject" ? "x" : "r";
    const value = `${prefix}.${idBase36}.${token}`;
    if (new TextEncoder().encode(value).length > 64) throw new Error("Telegram callback payload exceeded its limit");
    return value;
}

function reviewKeyboard(post, rawToken) {
    return {
        inline_keyboard: [[
            { text: "Approve", callback_data: callbackData("approve", post.id, rawToken) },
            { text: "Reject", callback_data: callbackData("reject", post.id, rawToken) },
            { text: "Regenerate", callback_data: callbackData("regenerate", post.id, rawToken) }
        ]]
    };
}

async function telegramCall(env, method, payload) {
    const response = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(12_000)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
        const error = Object.assign(new Error(data?.description || `Telegram ${method} returned HTTP ${response.status}`), {
            httpStatus: response.status,
            telegramOk: data?.ok === true
        });
        throw error;
    }
    return data.result;
}

async function sendDraftToOwner(env, post, text, token, existingMessage) {
    const chatId = env.TELEGRAM_ADMIN_USER_ID;
    const keyboard = reviewKeyboard(post, token);
    let message;
    if (existingMessage?.review_chat_id && existingMessage?.review_message_id) {
        try {
            message = await telegramCall(env, "editMessageText", {
                chat_id: chatId,
                message_id: existingMessage.review_message_id,
                text,
                reply_markup: keyboard
            });
        } catch (_) {
            message = null;
        }
    }
    if (!message) {
        message = await telegramCall(env, "sendMessage", {
            chat_id: chatId,
            text,
            reply_markup: keyboard,
            disable_web_page_preview: true
        });
    }
    return message;
}

async function createOrRegenerateDraft(env, scholarship, version, existing = null) {
    const post = existing || await reserveDraft(env, scholarship, version);
    if (post.alreadyDraft) {
        const token = null;
        return { post, alreadyDraft: true, token };
    }
    try {
        const opening = DRAFT_OPENING;
        const freshScholarship = await fetchPublishedScholarship(env, scholarship.id);
        if (!freshScholarship || await sourceVersion(freshScholarship) !== version) {
            await patchPost(env, post, "generating", {
                status: "stale",
                last_error: "Scholarship changed or is no longer published during draft generation.",
                updated_at: new Date().toISOString()
            });
            throw new Error("The scholarship changed or is no longer published. Run /draft again after reviewing its current details.");
        }
        const draftText = makeScholarshipPost(freshScholarship, opening);
        const token = randomToken();
        const tokenHash = await sha256Hex(token);
        const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();
        const ready = await patchPost(env, post, "generating", {
            status: "draft",
            source_version: version,
            draft_text: draftText,
            approval_token_hash: tokenHash,
            approval_token_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
            last_error: null
        });
        if (!ready) throw new Error("Draft state changed before it could be saved.");
        return { post: ready, token, draftText };
    } catch (error) {
        await patchPost(env, post, "generating", {
            status: "failed",
            last_error: String(error.message || "Draft generation failed").slice(0, 1000),
            updated_at: new Date().toISOString()
        }).catch(() => null);
        throw error;
    }
}

async function updateReviewMessageIds(env, post, message) {
    await supabaseRequest(env, `telegram_scholarship_posts?id=eq.${dbFilter(post.id)}&status=eq.draft`, {
        method: "PATCH",
        body: JSON.stringify({
            review_chat_id: String(message.chat?.id || env.TELEGRAM_ADMIN_USER_ID),
            review_message_id: message.message_id,
            updated_at: new Date().toISOString()
        })
    });
}

async function handleDraftCommand(env, scholarshipId) {
    if (!/^\d{1,20}$/.test(scholarshipId)) throw new Error("Use /draft followed by a numeric scholarship ID.");
    const scholarship = await fetchPublishedScholarship(env, scholarshipId);
    if (!scholarship) throw new Error("That scholarship does not exist or is not currently published.");
    const version = await sourceVersion(scholarship);
    const reserved = await reserveDraft(env, scholarship, version);
    let result;
    if (reserved.alreadyDraft) {
        const generating = await patchPost(env, reserved, "draft", {
            status: "generating",
            approval_token_hash: null,
            approval_token_expires_at: null,
            review_chat_id: null,
            review_message_id: null,
            generation: Number(reserved.generation || 0) + 1,
            updated_at: new Date().toISOString()
        });
        if (!generating) throw new Error("The pending draft changed while preparing a refreshed version.");
        result = await createOrRegenerateDraft(env, scholarship, version, generating);
    } else {
        result = await createOrRegenerateDraft(env, scholarship, version, reserved);
    }
    const message = await sendDraftToOwner(env, result.post, result.draftText, result.token, reserved);
    await updateReviewMessageIds(env, result.post, message);
    return message;
}

async function loadPost(env, postId) {
    const query = new URLSearchParams({
        select: "id,scholarship_id,source_version,draft_text,status,generation,approval_token_hash,approval_token_expires_at,approved_by_telegram_user_id,review_chat_id,review_message_id",
        id: `eq.${postId}`,
        limit: "1"
    });
    const rows = await supabaseRequest(env, `telegram_scholarship_posts?${query}`);
    return Array.isArray(rows) ? rows[0] || null : null;
}

function parseCallbackData(value) {
    const match = /^(a|x|r)\.([0-9a-z]{1,13})\.([A-Za-z0-9_-]{43})$/.exec(String(value || ""));
    if (!match) return null;
    let id = 0n;
    for (const character of match[2]) {
        const digit = parseInt(character, 36);
        if (!Number.isInteger(digit) || digit < 0 || digit >= 36) return null;
        id = id * 36n + BigInt(digit);
    }
    if (id <= 0n) return null;
    const action = match[1] === "a" ? "approve" : match[1] === "x" ? "reject" : "regenerate";
    return { action, postId: id.toString(), token: match[3] };
}

async function markPostStale(env, post, expectedStatus, reason) {
    await patchPost(env, post, expectedStatus, {
        status: "stale",
        approval_token_hash: null,
        approval_token_expires_at: null,
        last_error: reason.slice(0, 1000),
        updated_at: new Date().toISOString()
    });
}

async function publishApprovedPost(env, post) {
    let claimed;
    try {
        claimed = await callRpc(env, "claim_telegram_scholarship_publication", {
            p_post_id: post.id,
            p_current_source_version: post.source_version
        });
    } catch (error) {
        // The RPC response may be lost after its transaction commits. Close either
        // possible state without ever sending unless the claim is confirmed.
        await patchPost(env, post, "approved", {
            status: "failed",
            last_error: "Could not confirm the publication claim; no Telegram send was attempted.",
            updated_at: new Date().toISOString()
        }).catch(() => null);
        await callRpc(env, "mark_telegram_scholarship_publish_unknown", {
            p_post_id: post.id,
            p_error: "Could not confirm the publication claim. Check database state before retrying."
        }).catch(() => null);
        throw error;
    }
    if (claimed !== true) throw new Error("This scholarship post has already been claimed or is no longer current.");

    // Re-read immediately before the external send to avoid publishing an old or unpublished record.
    let fresh;
    try {
        fresh = await fetchPublishedScholarship(env, post.scholarship_id);
    } catch (error) {
        await callRpc(env, "mark_telegram_scholarship_publish_unknown", {
            p_post_id: post.id,
            p_error: "Could not re-verify source scholarship before Telegram send. Manual reconciliation required."
        }).catch(() => null);
        throw new Error("Could not verify the scholarship immediately before publishing; no automatic resend will occur.");
    }
    if (!fresh || await sourceVersion(fresh) !== post.source_version) {
        await patchPost(env, post, "publishing", {
            status: "stale",
            last_error: "Scholarship was unpublished or changed before Telegram send.",
            updated_at: new Date().toISOString()
        });
        throw new Error("The scholarship changed or is no longer published. Nothing was sent to the channel.");
    }

    try {
        const message = await telegramCall(env, "sendMessage", {
            chat_id: TELEGRAM_CHANNEL,
            text: post.draft_text,
            disable_web_page_preview: true
        });
        const marked = await callRpc(env, "mark_telegram_scholarship_published", {
            p_post_id: post.id,
            p_channel_chat_id: String(message.chat?.id || TELEGRAM_CHANNEL),
            p_channel_message_id: message.message_id
        });
        if (marked !== true) {
            await callRpc(env, "mark_telegram_scholarship_publish_unknown", {
                p_post_id: post.id,
                p_error: "Telegram accepted the post, but database confirmation did not complete. Check the channel before retrying."
            }).catch(() => null);
            throw new Error("Telegram accepted the post, but its database status could not be confirmed. Check the channel; it will not be resent automatically.");
        }
        return message;
    } catch (error) {
        if (error.telegramOk) {
            await callRpc(env, "mark_telegram_scholarship_publish_unknown", {
                p_post_id: post.id,
                p_error: String(error.message || "Telegram send outcome is uncertain")
            }).catch(() => null);
        } else if (error.httpStatus >= 500 || error.httpStatus === undefined) {
            await callRpc(env, "mark_telegram_scholarship_publish_unknown", {
                p_post_id: post.id,
                p_error: String(error.message || "Telegram send outcome is uncertain")
            }).catch(() => null);
        } else {
            await callRpc(env, "fail_telegram_scholarship_publication", {
                p_post_id: post.id,
                p_error: String(error.message || "Telegram rejected the send")
            }).catch(() => null);
        }
        throw error;
    }
}

async function handleCallback(env, callback) {
    const parsed = parseCallbackData(callback.data);
    if (!parsed) {
        await telegramCall(env, "answerCallbackQuery", {
            callback_query_id: callback.id,
            text: "This button is invalid or expired.",
            show_alert: true
        }).catch(() => null);
        return;
    }
    await telegramCall(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Processing…" }).catch(() => null);

    const post = await loadPost(env, parsed.postId);
    const tokenHash = await sha256Hex(parsed.token);
    if (post?.status === "approved" && parsed.action === "approve" && post.approved_by_telegram_user_id === String(callback.from.id)) {
        const scholarship = await fetchPublishedScholarship(env, post.scholarship_id);
        if (!scholarship || await sourceVersion(scholarship) !== post.source_version) {
            await markPostStale(env, post, "approved", "Scholarship was unpublished or changed before publication.");
            await telegramCall(env, "sendMessage", {
                chat_id: env.TELEGRAM_ADMIN_USER_ID,
                text: "The approved scholarship changed or is no longer published. Nothing was sent to the channel."
            });
            return;
        }
        try {
            const message = await publishApprovedPost(env, post);
            await telegramCall(env, "sendMessage", {
                chat_id: env.TELEGRAM_ADMIN_USER_ID,
                text: `Published to ${TELEGRAM_CHANNEL}. Message ID: ${message.message_id}`
            });
        } catch (error) {
            await telegramCall(env, "sendMessage", {
                chat_id: env.TELEGRAM_ADMIN_USER_ID,
                text: `Publication did not complete automatically: ${String(error.message || "Unknown error").slice(0, 700)}`
            }).catch(() => null);
            throw error;
        }
        return;
    }
    if (!post || post.status !== "draft" || post.approval_token_hash !== tokenHash || !post.approval_token_expires_at || Date.parse(post.approval_token_expires_at) <= Date.now()) {
        await telegramCall(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_USER_ID, text: "This draft action has already been used or has expired." });
        return;
    }

    if (parsed.action === "reject") {
        const rejected = await callRpc(env, "reject_telegram_scholarship_post", {
            p_post_id: post.id,
            p_current_source_version: post.source_version,
            p_token_hash: tokenHash,
            p_telegram_user_id: String(callback.from.id)
        });
        await telegramCall(env, "sendMessage", {
            chat_id: env.TELEGRAM_ADMIN_USER_ID,
            text: rejected === true ? "Draft rejected." : "This draft action has already been used or has expired."
        });
        return;
    }

    const scholarship = await fetchPublishedScholarship(env, post.scholarship_id);
    if (!scholarship || await sourceVersion(scholarship) !== post.source_version) {
        await markPostStale(env, post, "draft", "Scholarship was unpublished or changed before approval.");
        await telegramCall(env, "sendMessage", {
            chat_id: env.TELEGRAM_ADMIN_USER_ID,
            text: "The scholarship is unpublished or its details have changed. The old draft cannot be approved; use /draft with the scholarship ID to create a current version."
        });
        return;
    }

    if (parsed.action === "regenerate") {
        const generating = await patchPost(env, post, "draft", {
            status: "generating",
            approval_token_hash: null,
            approval_token_expires_at: null,
            review_chat_id: null,
            review_message_id: null,
            generation: Number(post.generation || 0) + 1,
            updated_at: new Date().toISOString()
        });
        if (!generating) throw new Error("Draft state changed; regenerate was not started.");
        const result = await createOrRegenerateDraft(env, scholarship, post.source_version, generating);
        const message = await sendDraftToOwner(env, result.post, result.draftText, result.token, post);
        await updateReviewMessageIds(env, result.post, message);
        return;
    }

    const approved = await callRpc(env, "approve_telegram_scholarship_post", {
        p_post_id: post.id,
        p_current_source_version: post.source_version,
        p_token_hash: tokenHash,
        p_telegram_user_id: String(callback.from.id)
    });
    if (approved !== true) {
        await telegramCall(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_USER_ID, text: "This draft action has already been used or has expired." });
        return;
    }
    try {
        const message = await publishApprovedPost(env, post);
        await telegramCall(env, "sendMessage", {
            chat_id: env.TELEGRAM_ADMIN_USER_ID,
            text: `Published to ${TELEGRAM_CHANNEL}. Message ID: ${message.message_id}`
        });
    } catch (error) {
        await telegramCall(env, "sendMessage", {
            chat_id: env.TELEGRAM_ADMIN_USER_ID,
            text: `Publication did not complete automatically: ${String(error.message || "Unknown error").slice(0, 700)}`
        }).catch(() => null);
        throw error;
    }
}

async function processUpdate(env, update) {
    const adminId = String(env.TELEGRAM_ADMIN_USER_ID);
    if (update.callback_query) {
        const callback = update.callback_query;
        if (String(callback.from?.id) !== adminId || String(callback.message?.chat?.id) !== adminId || callback.message?.chat?.type !== "private") {
            await telegramCall(env, "answerCallbackQuery", { callback_query_id: callback.id, text: "Unauthorized.", show_alert: true }).catch(() => null);
            return;
        }
        await handleCallback(env, callback);
        return;
    }
    const message = update.message;
    if (!message || message.chat?.type !== "private" || String(message.from?.id) !== adminId || String(message.chat?.id) !== adminId) return;
    const text = String(message.text || "").trim();
    const command = /^\/draft(?:@[A-Za-z0-9_]+)?\s+(\d{1,20})\s*$/.exec(text);
    if (command) {
        try {
            await handleDraftCommand(env, command[1]);
        } catch (error) {
            await telegramCall(env, "sendMessage", {
                chat_id: adminId,
                text: `Could not create the draft: ${String(error.message || "Please try again.").slice(0, 700)}`
            });
        }
    } else if (/^\/draft(?:@[A-Za-z0-9_]+)?\s*$/.test(text) || /^\/start(?:@[A-Za-z0-9_]+)?\s*$/.test(text)) {
        await telegramCall(env, "sendMessage", {
            chat_id: adminId,
            text: "Send /draft followed by a published scholarship ID, for example: /draft 3"
        });
    }
}

function webhookEventType(update) {
    if (update.message) return "message";
    if (update.callback_query) return "callback_query";
    return "other";
}

export async function handleTelegramWebhook(request, env) {
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }
    try {
        requireSecrets(env);
    } catch (error) {
        console.error("Telegram Worker configuration error:", error.message);
        return jsonResponse({ ok: false, error: "Bot is not configured." }, 503);
    }
    const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    if (suppliedSecret.length !== env.TELEGRAM_WEBHOOK_SECRET.length || !timingSafeEqual(suppliedSecret, env.TELEGRAM_WEBHOOK_SECRET)) {
        return jsonResponse({ ok: false }, 401);
    }
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > 128_000) return jsonResponse({ ok: false, error: "Payload too large." }, 413);

    let update;
    try { update = await request.json(); } catch (_) { return jsonResponse({ ok: false, error: "Invalid JSON." }, 400); }
    if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) {
        return jsonResponse({ ok: false, error: "Invalid Telegram update." }, 400);
    }

    try {
        const claimed = await callRpc(env, "claim_telegram_webhook_update", {
            p_update_id: update.update_id,
            p_event_type: webhookEventType(update)
        });
        if (claimed !== true) return jsonResponse({ ok: true, duplicate: true });
        await processUpdate(env, update);
        const finished = await callRpc(env, "finish_telegram_webhook_update", {
            p_update_id: update.update_id,
            p_result: "processed",
            p_error: null
        });
        if (finished !== true) throw new Error("Webhook update could not be marked processed");
        return jsonResponse({ ok: true });
    } catch (error) {
        console.error("Telegram webhook processing failed:", String(error.message || error).slice(0, 500));
        await callRpc(env, "finish_telegram_webhook_update", {
            p_update_id: update.update_id,
            p_result: "retryable",
            p_error: String(error.message || "Webhook processing failed").slice(0, 900)
        }).catch(() => null);
        return jsonResponse({ ok: false, error: "Temporary processing failure." }, 500);
    }
}

function timingSafeEqual(a, b) {
    let difference = a.length ^ b.length;
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
        difference |= (a.charCodeAt(index % Math.max(a.length, 1)) || 0) ^ (b.charCodeAt(index % Math.max(b.length, 1)) || 0);
    }
    return difference === 0;
}
