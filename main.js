const fs = require('fs');


function timeToSeconds(timeStr, isTwelveHour = true) {
    if (isTwelveHour) {
        let [time, modifier] = timeStr.split(' ');
        let [hours, minutes, seconds] = time.split(':').map(Number);

        if (modifier === 'pm' && hours < 12) hours += 12;
        if (modifier === 'am' && hours === 12) hours = 0;

        return hours * 3600 + minutes * 60 + seconds;
    }

    let [hours, minutes, seconds] = timeStr.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}


function secondsToTime(totalSeconds) {
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    return `${hours}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}


function getShiftDuration(startTime, endTime) {
    let start = timeToSeconds(startTime);
    let end = timeToSeconds(endTime);
    return secondsToTime(end - start);
}


function getIdleTime(startTime, endTime) {
    let start = timeToSeconds(startTime);
    let end = timeToSeconds(endTime);

    let deliveryStart = 8 * 3600;
    let deliveryEnd = 22 * 3600;

    let idleBefore = Math.max(0, deliveryStart - start);
    let idleAfter = Math.max(0, end - deliveryEnd);

    return secondsToTime(idleBefore + idleAfter);
}


function getActiveTime(shiftDuration, idleTime) {
    let duration = timeToSeconds(shiftDuration, false);
    let idle = timeToSeconds(idleTime, false);

    return secondsToTime(duration - idle);
}


function metQuota(date, activeTime) {
    let activeSeconds = timeToSeconds(activeTime, false);
    let targetSeconds = (8 * 3600) + (24 * 60);

    let currentDate = new Date(date);
    let eidStart = new Date("2025-04-10");
    let eidEnd = new Date("2025-04-30");

    if (currentDate >= eidStart && currentDate <= eidEnd) {
        targetSeconds = 6 * 3600;
    }

    return activeSeconds >= targetSeconds;
}


function addShiftRecord(textFile, shiftObj) {

    let data = [];
    if (fs.existsSync(textFile)) {
        data = fs.readFileSync(textFile,'utf8')
        .split('\n')
        .filter(line => line.trim() !== "");
    }

    let exists = data.some(line => {
        let cols = line.split(',');
        return cols[0] === shiftObj.driverID && cols[2] === shiftObj.date;
    });

    if (exists) return {};

    let duration = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
    let idle = getIdleTime(shiftObj.startTime, shiftObj.endTime);
    let active = getActiveTime(duration, idle);
    let quota = metQuota(shiftObj.date, active);

    let newRecord = {
        ...shiftObj,
        shiftDuration: duration,
        idleTime: idle,
        activeTime: active,
        metQuota: quota,
        hasBonus: false
    };

    let csvRow =
`${newRecord.driverID},${newRecord.driverName},${newRecord.date},${newRecord.startTime},${newRecord.endTime},${newRecord.shiftDuration},${newRecord.idleTime},${newRecord.activeTime},${newRecord.metQuota},${newRecord.hasBonus}`;

    let lastIndex = -1;

    for (let i = 0; i < data.length; i++) {
        if (data[i].split(',')[0] === shiftObj.driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex !== -1) {
        data.splice(lastIndex + 1, 0, csvRow);
    } else {
        data.push(csvRow);
    }

    fs.writeFileSync(textFile, data.join('\n'));

    return newRecord;
}


function setBonus(textFile, driverID, date, newValue) {

    let data = fs.readFileSync(textFile,'utf8').split('\n');

    let updatedData = data.map(line => {

        let cols = line.split(',');

        if (cols[0] === driverID && cols[2] === date) {
            cols[9] = String(newValue);
        }

        return cols.join(',');

    });

    fs.writeFileSync(textFile, updatedData.join('\n'));
}


function countBonusPerMonth(textFile, driverID, month) {

    let data = fs.readFileSync(textFile,'utf8')
    .split('\n')
    .filter(line => line.trim() !== "");

    let driverExists = data.some(line => line.split(',')[0] === driverID);

    if (!driverExists) return -1;

    let count = 0;

    data.forEach(line => {

        let cols = line.split(',');
        let recordMonth = parseInt(cols[2].split('-')[1]);

        if (
            cols[0] === driverID &&
            recordMonth === parseInt(month) &&
            cols[9] === 'true'
        ) {
            count++;
        }

    });

    return count;
}

/* Function 8 */
function getTotalActiveHoursPerMonth(textFile, driverID, month) {

    let data = fs.readFileSync(textFile,'utf8')
    .split('\n')
    .filter(line => line.trim() !== "");

    let totalSec = 0;

    data.forEach(line => {

        let cols = line.split(',');
        let recordMonth = parseInt(cols[2].split('-')[1]);

        if (cols[0] === driverID && recordMonth === parseInt(month)) {
            totalSec += timeToSeconds(cols[7], false);
        }

    });

    return secondsToTime(totalSec);
}


function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {

    let shiftData = fs.readFileSync(textFile,'utf8')
    .split('\n')
    .filter(line => line.trim() !== "");

    let rateData = fs.readFileSync(rateFile,'utf8')
    .split('\n')
    .filter(line => line.trim() !== "");

    let row = rateData.find(line => line.split(',')[0] === driverID);

    if (!row) return "0:00:00";

    let driverRate = row.split(',');
    let dayOff = driverRate[1].trim();

    let totalSec = 0;

    shiftData.forEach(line => {

        let cols = line.split(',');
        let recordDate = new Date(cols[2]);
        let recordMonth = recordDate.getMonth() + 1;

        let dayName = recordDate.toLocaleString('en-us', { weekday: 'long' });

        if (
            cols[0] === driverID &&
            recordMonth === parseInt(month) &&
            dayName !== dayOff
        ) {

            let dailyQuota = (8 * 3600) + (24 * 60);

            if (
                cols[2].startsWith("2025-04") &&
                recordDate.getDate() >= 10 &&
                recordDate.getDate() <= 30
            ) {
                dailyQuota = 6 * 3600;
            }

            totalSec += dailyQuota;
        }

    });

    totalSec -= (bonusCount * 2 * 3600);

    return secondsToTime(Math.max(0,totalSec));
}


function getNetPay(driverID, actualHours, requiredHours, rateFile) {

    let rateData = fs.readFileSync(rateFile,'utf8')
    .split('\n')
    .filter(line => line.trim() !== "");

    let row = rateData.find(line => line.split(',')[0] === driverID);

    if (!row) return 0;

    let driverRow = row.split(',');

    let basePay = parseInt(driverRow[2]);
    let tier = parseInt(driverRow[3]);

    let actualSec = timeToSeconds(actualHours,false);
    let requiredSec = timeToSeconds(requiredHours,false);

    if (actualSec >= requiredSec) return basePay;

    let missingSec = requiredSec - actualSec;

    let allowedMissingHours = [0,50,20,10,3][tier];

    let billableSec = Math.max(0, missingSec - (allowedMissingHours * 3600));
    let billableHours = Math.floor(billableSec / 3600);

    let deductionRate = Math.floor(basePay / 185);
    let deduction = billableHours * deductionRate;

    return basePay - deduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
