// The duel's original card back: layered gradient (CSS), bevelled double frame, an emblem of
// rings, an eight-pointed star and a central gem (inline SVG geometry), foil sheen on hover (CSS).
// One markup string so React (CardBack) and the animation ghosts draw the same back.

export const CARD_BACK_SVG = `<svg class="duel-back-art" viewBox="0 0 59 86" aria-hidden="true" focusable="false">
<rect class="bk-frame" x="2.2" y="2.2" width="54.6" height="81.6" rx="3.2"/>
<rect class="bk-inner" x="5.4" y="5.4" width="48.2" height="75.2" rx="2"/>
<path class="bk-corner" d="M8.5 15V8.5H15M44 8.5H50.5V15M50.5 71V77.5H44M15 77.5H8.5V71"/>
<path class="bk-lattice" d="M5.4 22.5L29.5 5.4L53.6 22.5M5.4 63.5L29.5 80.6L53.6 63.5"/>
<g transform="translate(29.5 43)">
<circle class="bk-halo" r="19"/>
<circle class="bk-ring" r="16.5"/>
<circle class="bk-ring2" r="12.5"/>
<rect class="bk-star" x="-9.5" y="-9.5" width="19" height="19"/>
<rect class="bk-star" x="-9.5" y="-9.5" width="19" height="19" transform="rotate(45)"/>
<path class="bk-tick" d="M0-23V-18.5M0 18.5V23M-23 0H-18.5M18.5 0H23M-16.3-16.3L-13.1-13.1M16.3 16.3L13.1 13.1M-16.3 16.3L-13.1 13.1M16.3-16.3L13.1-13.1"/>
<path class="bk-gem" d="M0-7.5L4.6 0L0 7.5L-4.6 0Z"/>
<path class="bk-gem-hi" d="M0-7.5L4.6 0L0 0Z"/>
</g>
</svg>`;

// A frame for art sleeves: the card's artwork under a bevelled double border and a small emblem.
export const SLEEVE_FRAME_SVG = `<svg class="duel-back-art" viewBox="0 0 59 86" aria-hidden="true" focusable="false">
<rect class="bk-frame" x="2.2" y="2.2" width="54.6" height="81.6" rx="3.2"/>
<rect class="bk-inner" x="5.4" y="5.4" width="48.2" height="75.2" rx="2"/>
<path class="bk-corner" d="M8.5 15V8.5H15M44 8.5H50.5V15M50.5 71V77.5H44M15 77.5H8.5V71"/>
<g transform="translate(29.5 76.4)"><circle class="sl-medal" r="4.2"/><path class="bk-gem" d="M0-2.6L1.7 0L0 2.6L-1.7 0Z"/></g>
</svg>`;

// A thin border for background sleeves (a scene fills the whole back).
export const SCENE_FRAME_SVG = `<svg class="duel-back-art sl-scene-frame" viewBox="0 0 59 86" aria-hidden="true" focusable="false">
<rect class="bk-frame" x="1.6" y="1.6" width="55.8" height="82.8" rx="3"/>
<rect class="bk-inner" x="3.6" y="3.6" width="51.8" height="78.8" rx="2"/>
</svg>`;
