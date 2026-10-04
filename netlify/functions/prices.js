const { db, json } = require('./_lib');

exports.handler = async () => {
  const { data, error } = await db().from('prices').select('size,cover,qty,price').eq('active', true).order('size').order('cover').order('qty');
  if (error) return json(500, { error: 'Could not load prices' });
  return { ...json(200, { prices: data }), headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } };
};
