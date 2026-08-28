/* ============================================================
 * 名称表：GATT 常用 UUID 名称 + 厂商/外观表（数据层，纯查表）
 * ============================================================ */
'use strict';

const BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';

export const SERVICE_NAMES = {
  '0x1800': 'Generic Access', '0x1801': 'Generic Attribute', '0x1802': 'Immediate Alert',
  '0x1803': 'Link Loss', '0x1804': 'Tx Power', '0x1805': 'Current Time Service',
  '0x1806': 'Reference Time Update Service', '0x1807': 'Next DST Change Service',
  '0x1808': 'Glucose', '0x1809': 'Health Thermometer', '0x180A': 'Device Information',
  '0x180D': 'Heart Rate', '0x180E': 'Phone Alert Status Service', '0x180F': 'Battery Service',
  '0x1810': 'Blood Pressure', '0x1811': 'Alert Notification Service',
  '0x1812': 'Human Interface Device', '0x1813': 'Scan Parameters',
  '0x1814': 'Running Speed and Cadence', '0x1815': 'Automation IO',
  '0x1816': 'Cycling Speed and Cadence', '0x1818': 'Cycling Power',
  '0x1819': 'Location and Navigation', '0x181A': 'Environmental Sensing',
  '0x181B': 'Body Composition', '0x181C': 'User Data', '0x181D': 'Weight Scale',
  '0x181E': 'Bond Management', '0x181F': 'Continuous Glucose Monitoring',
  '0x1820': 'Internet Protocol Support', '0x1821': 'Indoor Positioning',
  '0x1822': 'Pulse Oximeter', '0x1823': 'HTTP Proxy', '0x1824': 'Transport Discovery',
  '0x1825': 'Object Transfer', '0x1826': 'Fitness Machine', '0x1827': 'Mesh Provisioning',
  '0x1828': 'Mesh Proxy', '0x1829': 'Reconnection Configuration',
  '0x183A': 'Insulin Delivery', '0x1843': 'Audio Input Control', '0x1844': 'Volume Control',
  '0x1846': 'Coordinated Set Identification', '0x1847': 'Media Control',
  '0x1849': 'Hearing Access', '0x1850': 'Broadcast Audio Scan',
  '0x1851': 'Published Audio Capabilities', '0x1852': 'Basic Audio Announcement',
  '0x1853': 'Broadcast Audio Announcement', '0x1855': 'Common Audio',
  '0x1856': 'Broadcast Audio Control', '0x1858': 'Basic Audio',
  '0xFE59': 'Nordic UART Service', '0xFFE0': 'TI SensorTag',
  '0xFFE5': 'Nordic LED Button Service',
};

export const CHAR_NAMES = {
  '0x2A00': 'Device Name', '0x2A01': 'Appearance', '0x2A02': 'Peripheral Privacy Flag',
  '0x2A03': 'Reconnection Address', '0x2A04': 'Peripheral Preferred Connection Parameters',
  '0x2A05': 'Service Changed', '0x2A06': 'Alert Level', '0x2A07': 'Tx Power Level',
  '0x2A08': 'Date Time', '0x2A09': 'Day of Week', '0x2A0A': 'Day Date Time',
  '0x2A0C': 'Exact Time 256', '0x2A0D': 'DST Offset', '0x2A0E': 'Time Zone',
  '0x2A0F': 'Local Time Information', '0x2A11': 'Time with DST', '0x2A12': 'Time Accuracy',
  '0x2A13': 'Time Source', '0x2A14': 'Reference Time Information',
  '0x2A16': 'Time Update Control Point', '0x2A17': 'Time Update State',
  '0x2A18': 'Glucose Measurement', '0x2A19': 'Battery Level', '0x2A1C': 'Temperature Measurement',
  '0x2A1D': 'Temperature Type', '0x2A1E': 'Intermediate Temperature',
  '0x2A21': 'Measurement Interval', '0x2A22': 'Boot Keyboard Input Report',
  '0x2A23': 'System ID', '0x2A24': 'Model Number String', '0x2A25': 'Serial Number String',
  '0x2A26': 'Firmware Revision String', '0x2A27': 'Hardware Revision String',
  '0x2A28': 'Software Revision String', '0x2A29': 'Manufacturer Name String',
  '0x2A2A': 'IEEE 11073-20601 Regulatory Certification Data List', '0x2A2B': 'Current Time',
  '0x2A2C': 'Magnetic Declination', '0x2A31': 'Scan Refresh',
  '0x2A32': 'Boot Keyboard Output Report', '0x2A33': 'Boot Mouse Input Report',
  '0x2A34': 'Glucose Measurement Context', '0x2A35': 'Blood Pressure Measurement',
  '0x2A36': 'Intermediate Cuff Pressure', '0x2A37': 'Heart Rate Measurement',
  '0x2A38': 'Body Sensor Location', '0x2A39': 'Heart Rate Control Point',
  '0x2A3F': 'Alert Status', '0x2A40': 'Ringer Control Point', '0x2A41': 'Ringer Setting',
  '0x2A42': 'Alert Category ID Bit Mask', '0x2A43': 'Alert Category ID',
  '0x2A44': 'Alert Notification Control Point', '0x2A45': 'Unread Alert Status',
  '0x2A46': 'New Alert', '0x2A47': 'Supported New Alert Category',
  '0x2A48': 'Supported Unread Alert Category', '0x2A49': 'Blood Pressure Feature',
  '0x2A4A': 'HID Information', '0x2A4B': 'Report Map', '0x2A4C': 'HID Control Point',
  '0x2A4D': 'Report', '0x2A4E': 'Protocol Mode', '0x2A4F': 'Scan Interval Window',
  '0x2A50': 'PnP ID', '0x2A51': 'Glucose Feature', '0x2A52': 'Record Access Control Point',
  '0x2A53': 'RSC Measurement', '0x2A54': 'RSC Feature', '0x2A55': 'SC Control Point',
  '0x2A56': 'Digital', '0x2A57': 'Digital Output', '0x2A58': 'Analog',
  '0x2A59': 'Analog Output', '0x2A5A': 'Aggregate', '0x2A5B': 'CSC Measurement',
  '0x2A5C': 'CSC Feature', '0x2A5D': 'Sensor Location', '0x2A5E': 'PLX Spot-Check Measurement',
  '0x2A5F': 'PLX Continuous Measurement', '0x2A60': 'PLX Features',
  '0x2A63': 'Cycling Power Measurement', '0x2A64': 'Cycling Power Vector',
  '0x2A65': 'Cycling Power Feature', '0x2A66': 'Cycling Power Control Point',
  '0x2A67': 'Location and Speed', '0x2A68': 'Navigation', '0x2A69': 'Position Quality',
  '0x2A6A': 'LN Feature', '0x2A6B': 'LN Control Point', '0x2A6C': 'Elevation',
  '0x2A6D': 'Pressure', '0x2A6E': 'Temperature', '0x2A6F': 'Humidity',
  '0x2A70': 'True Wind Speed', '0x2A71': 'True Wind Direction', '0x2A72': 'Apparent Wind Speed',
  '0x2A73': 'Apparent Wind Direction', '0x2A74': 'Gust Factor', '0x2A75': 'Pollen Concentration',
  '0x2A76': 'UV Index', '0x2A77': 'Irradiance', '0x2A78': 'Rainfall', '0x2A79': 'Wind Chill',
  '0x2A7A': 'Heat Index', '0x2A7B': 'Dew Point', '0x2A7D': 'Descriptor Value Changed',
  '0x2A7E': 'Aerobic Heart Rate Lower Limit', '0x2A7F': 'Aerobic Threshold', '0x2A80': 'Age',
  '0x2A81': 'Anaerobic Heart Rate Lower Limit', '0x2A82': 'Anaerobic Heart Rate Upper Limit',
  '0x2A83': 'Anaerobic Threshold', '0x2A84': 'Aerobic Heart Rate Upper Limit',
  '0x2A85': 'Date of Birth', '0x2A86': 'Date of Threshold Assessment',
  '0x2A87': 'Email Address', '0x2A88': 'Fat Burn Heart Rate Lower Limit',
  '0x2A89': 'Fat Burn Heart Rate Upper Limit', '0x2A8A': 'First Name',
  '0x2A8B': 'Five Zone Heart Rate Limits', '0x2A8C': 'Gender', '0x2A8D': 'Heart Rate Max',
  '0x2A8E': 'Height', '0x2A8F': 'Hip Circumference', '0x2A90': 'Last Name',
  '0x2A91': 'Maximum Recommended Heart Rate', '0x2A92': 'Resting Heart Rate',
  '0x2A93': 'Sport Type for Aerobic and Anaerobic Thresholds', '0x2A94': 'Three Zone Heart Rate Limits',
  '0x2A95': 'Two Zone Heart Rate Limit', '0x2A96': 'VO2 Max', '0x2A97': 'Waist Circumference',
  '0x2A98': 'Weight', '0x2A99': 'Database Change Increment', '0x2A9A': 'User Index',
  '0x2A9B': 'Body Composition Feature', '0x2A9C': 'Body Composition Measurement',
  '0x2A9D': 'Weight Measurement', '0x2A9E': 'Weight Scale Feature',
  '0x2A9F': 'User Control Point', '0x2AA0': 'Magnetic Flux Density - 2D',
  '0x2AA1': 'Magnetic Flux Density - 3D', '0x2AA2': 'Language', '0x2AA3': 'Barometric Pressure Trend',
  '0x2AA4': 'Bond Management Control Point', '0x2AA5': 'Bond Management Feature',
  '0x2AA6': 'Central Address Resolution', '0x2AA7': 'CGM Measurement', '0x2AA8': 'CGM Feature',
  '0x2AA9': 'CGM Status', '0x2AAA': 'CGM Session Start Time', '0x2AAB': 'CGM Session Run Time',
  '0x2AAC': 'CGM Specific Ops Control Point', '0x2AAD': 'Indoor Positioning Configuration',
  '0x2AAE': 'Latitude', '0x2AAF': 'Longitude', '0x2AB0': 'Local North Coordinate',
  '0x2AB1': 'Local East Coordinate', '0x2AB2': 'Floor Number', '0x2AB3': 'Altitude',
  '0x2AB4': 'Uncertainty', '0x2AB5': 'Location Name', '0x2AB6': 'Transport Discovery Data',
  '0x2AB7': 'HTTP Headers', '0x2AB8': 'HTTP Status Code', '0x2AB9': 'HTTP Entity Body',
  '0x2ABA': 'HTTP Control Point', '0x2ABB': 'HTTPS Security', '0x2ABC': 'URI',
  '0x2ABD': 'TDS Control Point', '0x2ABE': 'OTS Feature', '0x2ABF': 'Object Name',
  '0x2AC0': 'Object Type', '0x2AC1': 'Object Size', '0x2AC2': 'Object First-Created',
  '0x2AC3': 'Object Last-Modified', '0x2AC4': 'Object ID', '0x2AC5': 'Object Properties',
  '0x2AC6': 'Object Action Control Point', '0x2AC7': 'Object List Control Point',
  '0x2AC8': 'Object List Filter', '0x2AC9': 'Object Changed',
  '0x2ACA': 'Resolvable Private Address Only', '0x2ACC': 'Fitness Machine Feature',
  '0x2ACD': 'Treadmill Data', '0x2ACE': 'Cross Trainer Data', '0x2ACF': 'Step Climber Data',
  '0x2AD0': 'Stair Climber Data', '0x2AD1': 'Rower Data', '0x2AD2': 'Indoor Bike Data',
  '0x2AD3': 'Training Status', '0x2AD4': 'Supported Speed Range',
  '0x2AD5': 'Supported Inclination Range', '0x2AD6': 'Supported Resistance Level Range',
  '0x2AD7': 'Supported Heart Rate Range', '0x2AD8': 'Supported Power Range',
  '0x2AD9': 'Supported Steps Per Minute Range', '0x2ADA': 'Supported Average Speed Range',
  '0x2ADB': 'Supported Cadence Range', '0x2ADC': 'Supported Adjustment',
  '0x2ADD': 'Fitness Machine Control Point', '0x2ADE': 'Fitness Machine Status',
  '0x2AEE': 'Mesh Provisioning Data In', '0x2AEF': 'Mesh Provisioning Data Out',
  '0x2AF0': 'Mesh Proxy Data In', '0x2AF1': 'Mesh Proxy Data Out', '0x2AF2': 'Average Current',
  '0x2AF3': 'Average Voltage', '0x2AF4': 'Direction', '0x2AF5': 'Electric Current',
  '0x2AF6': 'Electric Current Specification', '0x2AF7': 'Electric Current Statistics',
  '0x2AF8': 'Energy', '0x2AF9': 'Energy in a Period of Day', '0x2AFA': 'Energy Specification',
  '0x2AFB': 'Energy Statistics', '0x2AFC': 'Fixed String 16', '0x2AFD': 'Fixed String 24',
  '0x2AFE': 'Fixed String 36', '0x2AFF': 'Fixed String 8', '0x2B00': 'Generic Level',
  '0x2B01': 'Generic Text', '0x2B02': 'Generic UTF-8 String', '0x2B03': 'Generic Time',
  '0x2B04': 'Generic Enumeration', '0x2B05': 'Generic Bitmap', '0x2B06': 'Generic Date Time',
  '0x2B07': 'Generic uint8', '0x2B08': 'Generic uint16', '0x2B09': 'Generic uint24',
  '0x2B0A': 'Generic uint32', '0x2B0B': 'Generic uint64', '0x2B0C': 'Generic int8',
  '0x2B0D': 'Generic int16', '0x2B0E': 'Generic int24', '0x2B0F': 'Generic int32',
  '0x2B10': 'Generic int64', '0x2B11': 'Generic Float32', '0x2B12': 'Generic Float64',
  '0x2B13': 'Generic Structure', '0x2B14': 'Generic Structure Declaration',
  '0x2B15': 'Generic Structure Name', '0x2B16': 'Generic Structure Type',
  '0x2B17': 'Generic Structure Data', '0x2B18': 'Generic Descriptor',
  '0x2B19': 'Generic Descriptor Declaration', '0x2B1A': 'Generic Descriptor Name',
  '0x2B1B': 'Generic Descriptor Type', '0x2B1C': 'Generic Descriptor Data',
  '0x2B1D': 'Maximum Write Value Length', '0x2B1E': 'Maximum Data Length',
  '0x2B1F': 'Value Trigger Setting', '0x2B20': 'Value Trigger', '0x2B21': 'Value Trigger Output',
  '0x2B22': 'Value Trigger Control Point', '0x2B23': 'Value Trigger Status',
  '0x2B24': 'Value Trigger State', '0x2B25': 'Value Trigger Description',
};

export const DESCRIPTOR_NAMES = {
  '0x2900': 'Characteristic Extended Properties',
  '0x2901': 'Characteristic User Description',
  '0x2902': 'Client Characteristic Configuration',
  '0x2903': 'Server Characteristic Configuration',
  '0x2904': 'Characteristic Presentation Format',
  '0x2905': 'Characteristic Aggregate Format',
  '0x2906': 'Valid Range', '0x2907': 'External Report Reference',
  '0x2908': 'Report Reference', '0x2909': 'Number of Digitals',
  '0x290A': 'Value Trigger Setting', '0x290B': 'Environmental Sensing Configuration',
  '0x290C': 'Environmental Sensing Measurement',
  '0x290D': 'Environmental Sensing Trigger Setting', '0x290E': 'Time Trigger Setting',
  '0x290F': 'Complete BR-EDR Transport Block Data',
  '0x2910': 'Complete LE Transport Block Data', '0x2911': 'Characteristic Summary',
};

export const COMPANY_NAMES = {
  0x0000: 'Ericsson', 0x0001: 'Nokia', 0x0002: 'Intel', 0x0003: 'IBM', 0x0004: 'Toshiba',
  0x0005: '3Com', 0x0006: 'Microsoft', 0x0007: 'Lucent', 0x0008: 'Motorola', 0x000A: 'Qualcomm',
  0x000D: 'Texas Instruments', 0x000F: 'Broadcom', 0x0010: 'LSI', 0x0012: 'STMicroelectronics',
  0x0014: 'Renesas', 0x0016: 'Dell', 0x0018: 'CSR', 0x001C: 'Motorola Solutions',
  0x001F: 'TCL', 0x0020: 'Lenovo', 0x0026: 'HP', 0x0028: 'Seiko Epson', 0x002D: 'Bose',
  0x0030: 'Samsung Electronics', 0x0032: 'LG Electronics', 0x0036: 'OMRON', 0x0038: 'Acer',
  0x0039: 'Fitbit', 0x0041: 'Sony', 0x0043: 'NXP', 0x0046: 'Qualcomm', 0x004C: 'Apple',
  0x004E: 'Nokia', 0x0050: 'GN Netcom', 0x0059: 'Nordic Semiconductor', 0x0060: 'Xiaomi',
  0x0075: 'Huawei', 0x0087: 'Garmin', 0x00E0: 'Google', 0x0171: 'Amazon', 0x0175: 'Facebook',
};

export const APPEARANCE_NAMES = {
  0x0000: 'Unknown', 0x0040: 'Generic Phone', 0x0080: 'Generic Computer',
  0x00C0: 'Generic Watch', 0x0100: 'Generic Clock', 0x0140: 'Generic Display',
  0x0180: 'Generic Remote Control', 0x01C0: 'Generic Eye-glasses', 0x0200: 'Generic Tag',
  0x0240: 'Generic Keyring', 0x0280: 'Generic Media Player', 0x02C0: 'Generic Barcode Scanner',
  0x0300: 'Generic Thermometer', 0x0340: 'Generic Heart Rate Sensor',
  0x0380: 'Generic Blood Pressure', 0x03C0: 'Generic Human Interface Device',
  0x0400: 'Generic Glucose Meter', 0x0440: 'Generic Running Walking Sensor',
  0x0480: 'Generic Cycling', 0x04C0: 'Generic Pulse Oximeter', 0x0500: 'Generic Weight Scale',
  0x0540: 'Generic Outdoor Sports Activity', 0x1340: 'Cycling Computer',
  0x1341: 'Cycling Speed and Cadence Sensor', 0x1342: 'Cycling Power Sensor',
  0x1343: 'Cycling Speed Sensor', 0x1344: 'Cycling Cadence Sensor',
};

/* ---------- 查表工具 ---------- */
export function uuidTo16(uuid) {
  const s = String(uuid || '').toLowerCase();
  if (s.length === 36 && s.endsWith(BASE_UUID_SUFFIX)) {
    const v = parseInt(s.slice(0, 8), 16);
    if (!isNaN(v)) return v;
  }
  return null;
}

export function shortUuid(uuid) {
  const v = uuidTo16(uuid);
  if (v !== null) return v.toString(16).padStart(4, '0').toUpperCase();
  return String(uuid);
}

function nameFrom(map, uuid) {
  const v = uuidTo16(uuid);
  if (v === null) return '';
  // 表里的键大小写不统一（多为大写如 '0x2A00'），而 toString(16) 产小写，
  // 两种形式都要尝试，否则含 A-F 字母的 UUID 全部查不到名称。
  const hex = v.toString(16);
  return map['0x' + hex] || map['0x' + hex.toUpperCase()] || '';
}

export function serviceName(uuid) { return nameFrom(SERVICE_NAMES, uuid); }
export function characteristicName(uuid) { return nameFrom(CHAR_NAMES, uuid); }
export function descriptorName(uuid) { return nameFrom(DESCRIPTOR_NAMES, uuid); }

export function charLabel(uuid) {
  const n = characteristicName(uuid);
  if (n) return `${n} (${shortUuid(uuid)})`;
  return String(uuid);
}

export function descLabel(uuid) {
  const n = descriptorName(uuid);
  if (n) return `${n} (${shortUuid(uuid)})`;
  return String(uuid);
}

export function companyName(id) { return COMPANY_NAMES[id] || '未知厂商'; }
export function appearanceName(id) { return APPEARANCE_NAMES[id] || '未知'; }
