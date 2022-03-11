require('dotenv').config();
var moment = require('moment');

const express = require('express')
const app = express()
app.use(express.json());
app.use(express.urlencoded());

const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioWorkspaceSid = process.env.TWILIO_TASKROUTER_WORKSPACE_SID;
const twilioQueuesForDashboard = require('./queuesConfig').trackedQueues;

var cron = require('node-cron');


const fetchWallboardStats = async (taskChannel, startDate, endDate) => {

    const promisesList = [];
    twilioQueuesForDashboard.forEach(({ sid: queueSid, name: queueName }) => {
        const queueStatsQuery = twilioClient.taskrouter.workspaces(twilioWorkspaceSid)
            .taskQueues(queueSid)
            .statistics()
            .fetch({
                taskChannel,
                startDate,
                endDate
            }).then(d => {
                return {
                    queueName,
                    waitingCallCount: (d?.realtime?.tasks_by_status?.reserved || 0) + (d?.realtime?.tasks_by_status?.pending || 0),
                    longestCallInQueue: (d?.realtime?.longest_task_waiting_age || 0),
                    longestCallInQueueRelative: (d?.realtime?.longest_relative_task_age_in_queue || 0),
                    totalCalls: (d?.cumulative?.tasks_entered || 0),
                    handledCalls: (d?.cumulative?.tasks_completed || 0),
                    abandonedCalls: (d?.cumulative?.tasks_canceled || 0),
                    agentsTalking: (d?.realtime?.tasks_by_status?.assigned || 0),
                    agentsReady: (d?.realtime?.activity_statistics?.filter(act => ['Available'].indexOf(act.friendly_name) > -1).reduce((prev, curr) => prev + curr.workers, 0) || 0),
                    agentsNotReady: (d?.realtime?.activity_statistics?.filter(act => ['Available'].indexOf(act.friendly_name) == -1).reduce((prev, curr) => prev + curr.workers, 0) || 0),
                }
            })
        promisesList.push(queueStatsQuery);



    });


    const allWorkersQuery = twilioClient.taskrouter.workspaces(twilioWorkspaceSid)
        .workers
        .list({
            limit: 500
        }).then(d => d.map(w => {
            return {
                sid: w.sid,
                friendlyName: w.friendlyName,
                activityName: w.activityName
            }
        }))

    promisesList.push(allWorkersQuery);



    return Promise.allSettled(promisesList)
        .then((results) => results.map(r => r.value));


}





cron.schedule('*/30 * * * * *', async () => {

    const startDate = moment().startOf('day').toDate();
    const endDate = moment().endOf('day').toDate();

    const wallboardStats = await fetchWallboardStats('voice', startDate, endDate);
    console.dir(wallboardStats, { depth: null, colors: true })

    //Persist Wallboard Stats

});




async function exitHandler(options, exitCode) {

    console.log("Shutting Down");




    if (options.exit) process.exit();
}


process.on('exit', exitHandler.bind(null, { cleanup: true }));
process.on('SIGINT', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));
process.on('uncaughtException', exitHandler.bind(null, { exit: true }));