// The cast of episode 1. Both are public-domain characters, drawn in our own designs.
// A cast entry is a look for the penline rig plus cloth and a prop; shots.js gives each one a track.
(function () {
  const P = PEN, { add, scl } = PEN;
  const TAN = "#d0914e", NIGHT = "#1b1532", BLOOD = "#c8142f";
  // the cane: held in the right hand, pointing along the pose's `prop` direction
  function cane(g, J, w, st) {
    const fl = (st && st.flag) || {};
    if (fl.watch) { // the pocket watch, open in the left hand
      const q = P.project(add(J.hL, scl(J.spineUp, 0.05))), r = P.pxAt(J.hL, 0.035);
      if (q && r > 2) { g.save(); g.fillStyle = "#f2c14e"; g.strokeStyle = "#1d1b19"; g.lineWidth = Math.max(1, w * 0.8); g.beginPath(); g.arc(q[0], q[1], r, 0, 6.3); g.fill(); g.stroke(); g.fillStyle = "#fffbe8"; g.beginPath(); g.arc(q[0], q[1], r * 0.68, 0, 6.3); g.fill(); g.restore(); }
    }
    if (fl.noCane) return;
    const a = add(J.hR, scl(J.propDir, -0.1)), b = add(J.hR, scl(J.propDir, 0.84)), runs = P.projectLine([a, b]);
    if (!runs[0]) return;
    const px = Math.max(2.2, P.pxAt(J.hR, 0.028));
    P.ink(g, runs[0], { w: px + w * 1.2, color: "#1d1b19", seed: 71, double: false, wob: 0.15, over: 0 });
    P.ink(g, runs[0], { w: px, color: "#5a3420", seed: 72, double: false, wob: 0.15, over: 0 });
    const k = P.projectLine([a, add(J.hR, scl(J.propDir, -0.02))])[0], tip = P.projectLine([add(J.hR, scl(J.propDir, 0.78)), b])[0];
    if (k) P.ink(g, k, { w: px * 1.5, color: "#e9edf2", seed: 73, double: false, wob: 0.1, over: 0 });
    if (tip) P.ink(g, tip, { w: px, color: "#e9edf2", seed: 74, double: false, wob: 0.1, over: 0 });
  }
  window.CAST = {
    holmes: {
      name: "Sherlock Holmes", kind: "suit", seed: 11, rim: "#c9f1ff", prop: cane,
      look: { coatFill: TAN, lapel: "#dda765", vest: "#6d4a2f", tie: "#8f2f2a", trousers: "#3b2f29", trouserFill: "#6b5140", hat: "deerstalker", capColor: TAN, hair: "sides", hairColor: "#3a2c23", shoes: "black" },
      cloth: [
        { from: "waist", len: 0.62, rows: 5, w0: 0.07, w1: 0.16, flare: 0.1, out: 0.1, lag: 0.05, color: TAN, lining: "#a8703a", seed: 3 },   // coat tails
        { from: "sh", len: 0.42, rows: 4, w0: 0.03, w1: 0.1, flare: 0.08, out: 0.09, lag: 0.04, color: "#dda765", lining: "#a8703a", seed: 5 }, // the Inverness capelet
      ],
    },
    dracula: {
      name: "Dracula", kind: "suit", seed: 23, rim: "#ff7d9c",
      look: { coatFill: NIGHT, lapel: "#2b2350", vest: BLOOD, tie: false, trousers: "#141024", trouserFill: "#251d42", hat: "none", hair: "full", hairColor: "#16121f", shoes: "black", fangs: true, eyeColor: "#e8203f" },
      cloth: [{ from: "sh", len: 1.3, rows: 7, w0: 0.04, w1: 0.44, flare: 0.3, out: 0.08, lag: 0.05, color: NIGHT, lining: BLOOD, collar: true, scallop: 6, seed: 9 }],
    },
  };
})();
