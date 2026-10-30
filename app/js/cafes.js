// Campus dining directory carried over from the original prototype (public listings, consulted 28 Oct 2026).
const guide = 'https://uess.myusminfo.com/campus-guide-2023/um-2023/um-cafe-shops-on-campus-2023';
const um = 'https://sustainability.um.edu.my/healthy-and-sustainable-food-um';
export const CAFES = [
  ['He & She Coffee', 'UM Library', 'Central campus', 'Western dishes, coffee', guide],
  ['ZUS Coffee', 'Beside UM Library', 'Central campus', 'Drinks and pastries', guide],
  ['Euro Cafe', 'Kompleks Perdanasiswa', 'Central campus', 'Malay, Western and Arab dishes', guide],
  ['Rumah Universiti Cafe', 'Rumah Universiti', 'Campus edge', 'Malay dishes and kuih', guide],
  ['KPS Food Court', 'Kompleks Perdanasiswa, outside', 'Central campus', 'Rice dishes, spaghetti, Arab dishes', guide],
  ['Supa Bowl Vege', '4th Residential College', 'Residential colleges', 'Vegetarian options', um],
  ['He & She', 'UM Sentral', 'Residential colleges', 'Menu not published', um],
  ['KK7 Cafeteria', '7th Residential College', 'Residential colleges', 'Menu not published', um],
  ['KK5 Cafeteria', '5th Residential College', 'Residential colleges', 'Menu not published', um],
  ['Bayu Café', 'Faculty of Education', 'Academic zone', 'Menu not published', um],
  ['Koppiku', 'Kompleks Perdanasiswa', 'Central campus', 'Menu not published', um],
  ['Science Faculty Canteen', 'Faculty of Science', 'Academic zone', 'Menu not published', um],
  ['He & She · Dentistry', 'Faculty of Dentistry, Block B', 'Academic zone', 'Menu not published', um],
  ['KK10 Food Court', '10th Residential College', 'Residential colleges', 'Menu not published', um],
].map(([name, location, zone, food, source]) => ({ name, location, zone, food, source }));
export const MAP_EMBED = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3983.9039385421706!2d101.65221061525207!3d3.1201064541993873!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31cdb47024217187:0x1e85ebc65d47d641!2sUniversity-of-Malaya!5e0!3m2!1sen!2smy!4v1560931577458!5m2!1sen!2smy';
