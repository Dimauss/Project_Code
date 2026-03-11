import TgBotApi from 'node-telegram-bot-api';
import {
    CallAnswerStatus,
    CallResult,
    GetNotificationMessageIds,
    IsAnswerSaved,
    IsCallFinalized,
    SaveAnswer,
    SetNotificationMessageIds,
} from './call';
import { OpenDoor } from './mqtt';

const token = '';
const options: TgBotApi.ConstructorOptions = {
    polling: true,
};

const chatIds = [
    , // Ilya
    , // Natalia
    , // Dima
];
const femaleChatIds = [];

let bot: TgBotApi;

function localizeOpenText(from: TgBotApi.User) {
    return femaleChatIds.indexOf(from.id) > -1 ? 'открыла' : 'открыл';
}

async function UpdateAnsweredCall(callResult: CallResult, from: TgBotApi.User) {
    console.log('UpdateAnsweredCall: entering');

    await Promise.all(
        GetNotificationMessageIds().map(messageId => {
            let subjectName: string;
            if (callResult.answer_status === CallAnswerStatus.OpenEntrance) {
                subjectName = 'подъезд';
            } else if (callResult.answer_status === CallAnswerStatus.OpenEntranceAndDoor) {
                subjectName = 'подъезд и квартиру';
            }
            const messageText = `\`${from.first_name} ${localizeOpenText(
                from
            )} ${subjectName} в ${new Date().toLocaleString('ru-RU')}\``;
            return bot.editMessageText(messageText, {
                chat_id: messageId.chat_id,
                message_id: messageId.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [],
                },
            });
        })
    );

    console.log('UpdateAnsweredCall: exiting');
}

async function TextHandler(msg: TgBotApi.Message, match: RegExpExecArray | null) {
    console.log('TextHandler: entering');

    if (chatIds.indexOf(msg.chat.id) === -1) {
        console.warn('Unknown user');
        console.log(JSON.stringify(msg, null, 4));
        return;
    }

    const callResult: CallResult = { answer_user_id: msg.from.id, answer_status: CallAnswerStatus.OpenEntrance };

    if (IsAnswerSaved()) {
        // someone already answered the call - leave it
    } else if (IsCallFinalized()) {
        // call abandoned - leave it
    } else {
        SaveAnswer(callResult);
        await UpdateAnsweredCall(callResult, msg.from);
    }

    console.log('TextHandler: exiting');
}

async function ButtonHandler(query: TgBotApi.CallbackQuery) {
    console.log('ButtonHandler: entering');

    let callResult: CallResult;
    if (query.data === CallAnswerStatus.OpenEntrance) {
        callResult = { answer_user_id: query.from.id, answer_status: CallAnswerStatus.OpenEntrance };
    } else if (query.data === CallAnswerStatus.OpenEntranceAndDoor) {
        callResult = { answer_user_id: query.from.id, answer_status: CallAnswerStatus.OpenEntranceAndDoor };
    }

    if (IsAnswerSaved()) {
        // someone already answered the call - leave it
    } else if (IsCallFinalized()) {
        // call abandoned - leave it
    } else {
        SaveAnswer(callResult);
        await UpdateAnsweredCall(callResult, query.from);
        if (callResult.answer_status === CallAnswerStatus.OpenEntranceAndDoor) {
            await OpenDoor();
        }
    }

    console.log('ButtonHandler: exiting');
}

export async function NotifyUsers() {
    console.log('NotifyUsers: entering');

    const messages = await Promise.all(
        chatIds.map(async chatId => {
            let message: TgBotApi.Message;
            try {
                message = await bot.sendMessage(chatId, 'Звонят в домофон. Что открыть?', {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'подъезд', callback_data: CallAnswerStatus.OpenEntrance },
                                { text: 'подъезд и квартиру', callback_data: CallAnswerStatus.OpenEntranceAndDoor },
                            ],
                        ],
                    },
                });
            } catch (e) {
                console.error(`Error sending message to ${chatId}`, e);
            }
            return message;
        })
    );

    SetNotificationMessageIds(messages.filter(m => !!m).map(m => ({ chat_id: m.chat.id, message_id: m.message_id })));
    console.log('NotifyUsers: exiting');
}

export async function SaveAbandonedCall() {
    console.log('SaveAbandonedCall: entering');

    await Promise.all(
        GetNotificationMessageIds().map(messageId => {
            const messageText = `\`Звонок перенаправлен на трубку в квартире\``;
            return bot.editMessageText(messageText, {
                chat_id: messageId.chat_id,
                message_id: messageId.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [],
                },
            });
        })
    );

    console.log('SaveAbandonedCall: exiting');
}

export async function SaveInterruptedCall() {
    console.log('SaveInterruptedCall: entering');

    await Promise.all(
        GetNotificationMessageIds().map(messageId => {
            const messageText = `\`Звонок прерван\``;
            return bot.editMessageText(messageText, {
                chat_id: messageId.chat_id,
                message_id: messageId.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [],
                },
            });
        })
    );

    console.log('SaveInterruptedCall: exiting');
}

export async function StartBot() {
    bot = new TgBotApi(token, options);
    bot.onText(/.*/gi, TextHandler);
    bot.on('callback_query', ButtonHandler);
}

export async function StopBot() {
    await bot.close();
}
