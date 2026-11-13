-- Card rarities picked in the deck builder: a JSON object { "<card id>": "rare" | "super" | ... } (commons left out).
ALTER TABLE decks ADD COLUMN rarity TEXT;
