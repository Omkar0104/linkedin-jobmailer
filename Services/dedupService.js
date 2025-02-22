const deduplicateJobs = (data) => {
  const emailMap = new Map();
  let duplicatesCount = 0;
  
  // Filter out duplicates
  const uniqueData = data.filter(item => {
      if (emailMap.has(item.email)) {
          duplicatesCount++;
          return false;
      } else {
          emailMap.set(item.email, true);
          return true;
      }
  });


  return { uniqueData, duplicatesCount };

  };
  
  module.exports = { deduplicateJobs };