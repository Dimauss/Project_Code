import AGI, { Channel } from '@gibme/asterisk-gateway-interface';

import { FinalizeCall, InterruptChannel, IsAnswerSaved, IsCallInterrupted, StartCall } from './call';
import { SaveAbandonedCall, NotifyUsers, SaveInterruptedCall } from './tg';
import { NotifyDoorbell } from './mqtt';

let agi: AGI;

const pollInterval = 1000;
const pollAttempts = 20;
enum UserMode {
    FREE = 'free',
    BUSY = 'busy'
}
async function SpeechToText(file: string): Promise<string>

async function AgiAnswer(channel: Channel) {
    await channel.answer();
    // await channel.exec('WAIT', '1');
    await channel.exec('SENDDTMF', '55');
    try {
        // await channel.exec('WAIT', '1');
        await channel.exec('SENDDTMF', '55');
    } catch {
        console.log(`${channel.uniqueid} - AgiHandler: second open failed`);
    }
    try {
        // await channel.exec('WAIT', '1');
        await channel.exec('SENDDTMF', '55');
    } catch {
        console.log(`${channel.uniqueid} - AgiHandler: third open failed`);
    }
    try {
        await channel.hangup();
    } catch {
        console.log(`${channel.uniqueid} - AgiHandler: channel destroyed before hangup`);
    }
}

function AgiClose(channel: Channel) {
    return () => {
        console.log(`${channel.uniqueid} - AgiHandler: Channel closing`);
        if (IsCallInterrupted()) {
            console.log(`${channel.uniqueid} - AgiHandler: Channel closed with interrupted call`);
            SaveInterruptedCall();
            FinalizeCall();
        } else {
            console.log(`${channel.uniqueid} - AgiHandler: Channel closed OK`);
        }
    };
}

async function AgiHandler(channel: Channel) {
    try {
        channel.on('close', AgiClose(channel));
        channel.on('error', (error: Error) =>
            console.log(`${channel.uniqueid} - AgiHandler: channel error ${error.message}`)
        );
        channel.on('ready', () => console.log(`${channel.uniqueid} - AgiHandler: channel ready`));
        channel.on('hangup', () => console.log(`${channel.uniqueid} - AgiHandler: channel hangup`));
        channel.on('timeout', () => console.log(`${channel.uniqueid} - AgiHandler: channel timeout`));

        await channel.verbose('AgiHandler: Incoming call');
        console.log(`${channel.uniqueid} - AgiHandler: Incoming call`);
        if (IsCallInterrupted()) {
            await InterruptChannel();
            SaveInterruptedCall();
        }
        StartCall(channel);
        console.log(`${channel.uniqueid} - AgiHandler: New call, asking user`);
        await Promise.all([NotifyUsers(), NotifyDoorbell()]);
        let isAnswerSaved = false;
        for (let i = 0; i < pollAttempts; ++i) {
            if (IsAnswerSaved()) {
                isAnswerSaved = true;
                console.log(`${channel.uniqueid} - AgiHandler: Answered after ${i} requests`);
                break;
            }
            if ((i + 1) % 5 === 0) {
                await channel.verbose(`AgiHandler: Sent ${i + 1} requests`);
                console.log(`${channel.uniqueid} - AgiHandler: Sent ${i + 1} requests`);
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        console.log(`${channel.uniqueid} - AgiHandler: Finalizing call`);
        FinalizeCall();
        if (isAnswerSaved) {
            console.log(`${channel.uniqueid} - AgiHandler: Call answered, opening door`);
            await AgiAnswer(channel);
        } else {
            console.log(`${channel.uniqueid} - AgiHandler: No answer, calling Linphone`);
            await SaveAbandonedCall();

            try {
                await channel.exec('Dial', 'PJSIP/1001,30');
            } catch (err) {
                console.log(`${channel.uniqueid} - AgiHandler: Linphone call failed`);
            }

            try {
                await channel.hangup();
            } catch {
                console.log(`${channel.uniqueid} - AgiHandler: channel destroyed before hangup`);
            }
        }
    } catch (err) {
        const message = err.message || '';
        console.error(`AGI Error: \n message: ${message} \n stack: ${err.stack}`);
    }
}
async function HandleBusyMode(channel: Channel) {
    await channel.answer();
    await channel.exec('Playback', 'please-say-password')
    await channel.exec('Record', '/tmp/password.wav,3,5');
    const password = await SpeechToText('/tmp/password.wav');
    if (password === 'delivery') {
        console.log(`${channel.uniqueid} - password correct`);
        await AgiAnswer(channel);
    } else {
        console.log(`${channel.uniqueid} - password incorrect`);
        await channel.exec('Playback', 'access-denied');
        await channel.hangup();
    }
}
export async function StartAgi() {
    agi = new AGI(3000);
    agi.on('channel', AgiHandler);
    await agi.start();
}

export async function StopAgi() {
    await agi.stop();
}
