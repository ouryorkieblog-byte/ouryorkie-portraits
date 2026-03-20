export default async function handler(req, res) {
  const { url, filename } = req.query;

  if (!url) return res.status(400).json({ error: 'Missing URL' });

  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const safeFilename = filename || 'yorkie-portrait.jpg';

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', buffer.byteLength);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Download failed' });
  }
}
