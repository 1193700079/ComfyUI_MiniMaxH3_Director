/** MiniMax H3 Director SelfLift — split-mode widget visibility + cache witness. */

import { app } from "../../scripts/app.js";

const SELFLIFT_CLASS = "MiniMaxH3DirectorSelfLift";
const DIRECTOR_CLASSES = new Set(["MiniMaxH3Director", "ComfyMiniMaxH3Director"]);
const BYPASS_MODES = new Set([2, 4]);

function isSelfLiftNode(node) {
    const cls = node?.comfyClass || node?.type || "";
    return cls === SELFLIFT_CLASS;
}

function widgetByName(node, name) {
    return node.widgets?.find((w) => w.name === name);
}

function setWidgetVisible(node, name, visible) {
    const w = widgetByName(node, name);
    if (!w) return;
    w.hidden = !visible;
    if (!w.options) w.options = {};
    w.options.hidden = !visible;
    if (visible) {
        if (w._mmxOrigComputeSize) {
            w.computeSize = w._mmxOrigComputeSize;
            delete w._mmxOrigComputeSize;
        } else if (w.computeSize && w.computeSize._mmxSelfLiftHide) {
            delete w.computeSize;
        }
        if (w.element) w.element.style.display = "";
    } else {
        if (!w._mmxOrigComputeSize && typeof w.computeSize === "function") {
            w._mmxOrigComputeSize = w.computeSize.bind(w);
        }
        const hide = () => [0, -4];
        hide._mmxSelfLiftHide = true;
        w.computeSize = hide;
        if (w.element) w.element.style.display = "none";
    }
}

function widgetValue(w) {
    if (!w) return undefined;
    const v = w.value;
    if (v && typeof v === "object") {
        if (typeof v.content === "string") return v.content;
        if (typeof v.value === "string") return v.value;
    }
    return v;
}

function graphLinkRecord(graph, linkId) {
    if (linkId == null || !graph) return null;
    const links = graph.links;
    if (!links) return null;
    let link = links[linkId];
    if (!link && typeof links.find === "function") {
        link = links.find((l) => l && (l.id === linkId || l[0] === linkId));
    }
    if (!link) return null;
    return {
        originId: link.origin_id ?? link[1],
        originSlot: link.origin_slot ?? link[2],
    };
}

function linkedSourceNode(graph, node, inputName) {
    if (!graph || !node) return null;
    const inp = (node.inputs || []).find((i) => i?.name === inputName);
    if (inp?.link == null) return null;
    const rec = graphLinkRecord(graph, inp.link);
    if (!rec) return null;
    return graph.getNodeById?.(rec.originId) || null;
}

function isPassthroughNode(node) {
    if (!node) return false;
    const cls = String(node.comfyClass || node.type || "");
    if (/reroute/i.test(cls)) return true;
    if (node.isVirtualNode) {
        const linked = (node.inputs || []).filter((i) => i?.link != null);
        if (linked.length === 1) return true;
    }
    return false;
}

function firstLinkedInputName(node) {
    const inp = (node?.inputs || []).find((i) => i?.link != null);
    return inp?.name || null;
}

function nodeMuted(node) {
    return BYPASS_MODES.has(Number(node?.mode ?? 0));
}

function resolveSelfLiftNode(director) {
    const graph = director?.graph;
    if (!graph) return null;
    let node = director;
    let inputName = "selflift";
    for (let hop = 0; hop < 16; hop += 1) {
        const src = linkedSourceNode(graph, node, inputName);
        if (!src || nodeMuted(src)) return null;
        if (isSelfLiftNode(src)) return src;
        if (isPassthroughNode(src)) {
            node = src;
            inputName = firstLinkedInputName(src);
            if (!inputName) return null;
            continue;
        }
        const emits = (src.outputs || []).some(
            (out) => String(out?.type || "") === "MMX_DIR_SELFLIFT",
        );
        return emits ? src : null;
    }
    return null;
}

function widgetStr(node, name, fallback) {
    const v = widgetValue(widgetByName(node, name));
    if (v == null || v === "") return fallback;
    return String(v);
}

function widgetNum(node, name, fallback) {
    const n = Number(widgetValue(widgetByName(node, name)));
    return Number.isFinite(n) ? n : fallback;
}

function widgetBool(node, name, fallback) {
    const v = widgetValue(widgetByName(node, name));
    if (v === true || v === false) return v;
    if (v == null || v === "") return fallback;
    if (v === 1 || v === "1" || v === "true") return true;
    if (v === 0 || v === "0" || v === "false") return false;
    return Boolean(v);
}

function hiresModelLinked(node) {
    const src = linkedSourceNode(node?.graph, node, "model_hires");
    return Boolean(src && !nodeMuted(src));
}

/**
 * Pack the graph-wired SelfLift node so the first-pass cache panel can compare
 * the same sl_* fingerprint keys the run writes. Unconnected / bypassed → null.
 */
export function collectSelfLiftWitness(director) {
    const src = resolveSelfLiftNode(director);
    if (!src) return null;
    return {
        enabled: true,
        split_mode: widgetStr(src, "split_mode", "highres_steps"),
        highres_steps: widgetNum(src, "highres_steps", 2),
        transition_step: widgetNum(src, "transition_step", 6),
        lowres_scale: widgetNum(src, "lowres_scale", 0.5),
        sampler_mode: widgetStr(src, "sampler_mode", "euler"),
        native_low_carry: widgetBool(src, "native_low_carry", true),
        latent_upscale_model: widgetStr(src, "latent_upscale_model", ""),
        latent_upsample: widgetStr(src, "latent_upsample", "bilinear"),
        rho: widgetNum(src, "rho", 0),
        w_min: widgetNum(src, "w_min", 0.5),
        w_max: widgetNum(src, "w_max", 1),
        enable_latent_chunking: widgetBool(src, "enable_latent_chunking", false),
        enable_tiling: widgetBool(src, "enable_tiling", false),
        tile_count: widgetNum(src, "tile_count", 2),
        tile_overlap: widgetNum(src, "tile_overlap", 128),
        sample_model: hiresModelLinked(src) ? true : null,
    };
}

function syncSelfLiftWidgets(node) {
    if (!isSelfLiftNode(node)) return;
    const split = String(widgetValue(widgetByName(node, "split_mode")) || "highres_steps");
    const trans = split === "transition_step";
    setWidgetVisible(node, "highres_steps", !trans);
    setWidgetVisible(node, "transition_step", trans);
    const rho = Number(widgetValue(widgetByName(node, "rho")) || 0);
    const pixel = rho > 1e-8;
    setWidgetVisible(node, "w_min", pixel);
    setWidgetVisible(node, "w_max", pixel);
    const tiling = widgetValue(widgetByName(node, "enable_tiling")) === true;
    setWidgetVisible(node, "tile_count", tiling);
    setWidgetVisible(node, "tile_overlap", tiling);
}

function graphNodes() {
    const graph = app.graph ?? app.canvas?.graph;
    return graph?._nodes ?? graph?.nodes ?? [];
}

function refreshLinkedDirectorCache(delay = 120) {
    for (const node of graphNodes()) {
        const cls = node?.comfyClass || node?.type || "";
        if (!DIRECTOR_CLASSES.has(cls)) continue;
        if (typeof node._mmxRefreshFirstPassCache === "function") {
            node._mmxRefreshFirstPassCache(delay);
        }
    }
}

app.registerExtension({
    name: "minimax.h3.director.selflift",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== SELFLIFT_CLASS) return;
        const onWidgetChanged = nodeType.prototype.onWidgetChanged;
        nodeType.prototype.onWidgetChanged = function (...args) {
            const result = onWidgetChanged?.apply(this, args);
            refreshLinkedDirectorCache();
            return result;
        };
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (...args) {
            const result = onConnectionsChange?.apply(this, args);
            refreshLinkedDirectorCache();
            return result;
        };
    },
    nodeCreated(node) {
        if (!isSelfLiftNode(node)) return;
        for (const name of ["split_mode", "rho", "enable_tiling"]) {
            const w = widgetByName(node, name);
            if (!w) continue;
            const orig = w.callback;
            w.callback = function (...args) {
                if (typeof orig === "function") orig.apply(this, args);
                syncSelfLiftWidgets(node);
            };
        }
        syncSelfLiftWidgets(node);
    },
});
