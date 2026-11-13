// Text for the core's hint / system-string ids (HINTMSG_* in CardScripts' constant.lua).
// EDOPro keeps the full list in its client strings.conf; these cover the common prompts.
// Ids >= 1<<20 are card strings (code << 20 | index) and are resolved by the caller.

const HINTS: Record<number, string> = {
  500: "Select the card(s) to Tribute", 501: "Select the card(s) to discard", 502: "Select the card(s) to destroy",
  503: "Select the card(s) to banish", 504: "Select the card(s) to send to the GY", 505: "Select the card(s) to return to the hand",
  506: "Select the card(s) to add to your hand", 507: "Select the card(s) to return to the Deck",
  508: "Select the monster to Normal Summon", 509: "Select the monster(s) to Special Summon", 510: "Select the card(s) to Set",
  511: "Select the Fusion Material(s)", 512: "Select the Synchro Material(s)", 513: "Select the Xyz Material(s)",
  514: "Select a face-up card", 515: "Select a face-down card", 516: "Select an Attack Position monster",
  517: "Select a Defense Position monster", 518: "Select the card to equip", 519: "Select the material(s) to detach",
  520: "Select the monster to take control of", 521: "Select the card to destroy instead", 522: "Select a face-up Attack Position monster",
  523: "Select a face-up Defense Position monster", 524: "Select a face-down Attack Position monster",
  525: "Select a face-down Defense Position monster", 526: "Select the card(s) to reveal", 527: "Select the card(s) to place on the field",
  528: "Select the monster(s) to change the battle position of", 529: "Select your card(s)", 530: "Select your opponent's card(s)",
  531: "Select the monster(s) to Tribute", 532: "Select the monster to detach material from", 533: "Select the Link Material(s)",
  549: "Select the attack target", 550: "Select the effect to activate", 551: "Select the target(s)", 552: "Call heads or tails",
  553: "Select a die result", 554: "Select a card type", 555: "Select an option", 556: "Select the effect to resolve",
  560: "Select", 561: "Select a battle position", 562: "Declare an Attribute", 563: "Declare a Type", 564: "Declare a card name",
  565: "Declare a number", 566: "Select the effect to activate", 567: "Declare a Level/Rank", 568: "Select the card to resolve",
  569: "Select a zone", 570: "Select the zone(s) to disable", 571: "Select the zone to move to", 572: "Select the counter(s) to remove",
  575: "Select the effect to negate", 576: "Select ATK or DEF", 577: "Select the card to apply the effect to",
  578: "Select the card(s) to attach", 579: "Select the card(s) to return to the GY",
  // a few client system strings (EDOPro strings.conf); unknown ids render as "#id"
  1150: "Activate", 1151: "Normal Summon", 1152: "Special Summon", 1153: "Set", 1154: "Flip Summon",
  1155: "Change to Defense Position", 1156: "Change to Attack Position",
  // options / yes-no questions the scripts ask with system strings
  31: "Attack directly?", 70: "Monster", 71: "Spell", 72: "Trap", 93: "Continue selecting?", 94: "Use this effect?", 210: "Continue?",
  573: "Add it to your hand", 574: "Send it to the GY", 1213: "Attack directly", 1214: "Attack a monster",
  // effect descriptions of the standard procedures (proc_*.lua)
  1160: "Activate this card", 1163: "Pendulum Summon", 1170: "Fusion Summon", 1171: "Ritual Summon",
  1172: "Synchro Summon", 1173: "Xyz Summon", 1174: "Link Summon",
  // attributes (1010 + bit) and card types (1050 + bit), offered when you declare one
  1010: "EARTH", 1011: "WATER", 1012: "FIRE", 1013: "WIND", 1014: "LIGHT", 1015: "DARK", 1016: "DIVINE",
  1050: "Monster", 1051: "Spell", 1052: "Trap", 1054: "Normal", 1055: "Effect", 1056: "Fusion", 1057: "Ritual",
  1059: "Spirit", 1060: "Union", 1061: "Gemini", 1062: "Tuner", 1063: "Synchro", 1064: "Token", 1066: "Quick-Play",
  1067: "Continuous", 1068: "Equip", 1069: "Field", 1070: "Counter", 1071: "Flip", 1072: "Toon", 1073: "Xyz", 1074: "Pendulum", 1076: "Link",
};

/** `cardName` resolves a plain card code: the core sends one as the select hint when a
 *  specific card is being placed (e.g. "choose a zone" while Setting it). */
export function hintText(id: number, cardString: (d: bigint) => string, cardName?: (code: number) => string | null): string {
  if (id >= 1 << 20) {
    // ambiguous: a plain passcode (e.g. Mirror Force 44095762) is also >= 1 << 20; real card strings
    // of real cards are >= 10000 << 20. Prefer the card's name when the id is a known passcode.
    const name = id < 2 ** 32 ? cardName?.(id) : null;
    return name ?? cardString(BigInt(id));
  }
  if (HINTS[id]) return HINTS[id];
  if (id === 0) return "";                         // no hint
  if (id >= 10_000) return cardName?.(id) ?? "";   // a card code: its name, or nothing if unknown
  return `#${id}`;
}
