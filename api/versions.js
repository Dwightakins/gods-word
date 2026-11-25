// Tells the app whether the online versions (NIV, NKJV, AMP) are switched on.
// It doesn't call API.Bible, so it doesn't use up the monthly allowance.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  res.status(200).json({ online: !!process.env.API_BIBLE_KEY, versions: ['NIV', 'NKJV', 'AMP'] });
};
