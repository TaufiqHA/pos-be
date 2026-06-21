const prisma = require('../prisma');

exports.getSettings = async (req, res) => {
  try {
    const settings = await prisma.setting.findMany();
    // Return key-value pair
    const formattedSettings = {};
    settings.forEach(s => {
      formattedSettings[s.key] = s.value;
    });
    res.json(formattedSettings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateSetting = async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  try {
    const setting = await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    res.json(setting);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
