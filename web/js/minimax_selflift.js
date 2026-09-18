/** MiniMax H3 Director SelfLift — split-mode widget visibility. */

import { app } from "../../scripts/app.js";

const SELFLIFT_CLASS = "MiniMaxH3DirectorSelfLift";

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

app.registerExtension({
    name: "minimax.h3.director.selflift",
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
