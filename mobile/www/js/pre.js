// Globals the shared power-up / game-pack code (catalog.gen.js, from the PC app) expects to exist.
var CFG = { profiles: {} };   // the box's config (the app's working copy)
var STATE = null;             // last "state" event from the box
var curProfile = null;        // profile being looked at
var puProfile = null;         // profile power-ups are being added to
