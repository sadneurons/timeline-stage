/* timeline-stage layout: pure functions. UMD so node tests and the browser share it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StageLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return {};
});
