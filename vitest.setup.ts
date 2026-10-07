import "@testing-library/jest-dom/vitest";
import React from "react";

(globalThis as unknown as { React: typeof React }).React = React;

class MockResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

if (typeof window !== "undefined") {
    window.ResizeObserver = window.ResizeObserver || (MockResizeObserver as unknown as typeof ResizeObserver);

    if (!Element.prototype.scrollIntoView) {
        Element.prototype.scrollIntoView = () => {};
    }

    if (!window.PointerEvent) {
        class MockPointerEvent extends MouseEvent {}
        window.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
    }
}
