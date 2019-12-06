import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import * as TextAnalyticsAPIClient from "@azure/cognitiveservices-textanalytics";
import * as CognitiveServicesCredentials from "@azure/ms-rest-js";
import * as rpn from 'request-promise-native';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('HTTP trigger function processed a request.');

    const methodType = req.body.methodType;
    let letterToSanta: LetterToSanta = new LetterToSanta(req.body.who, req.body.message);

    // 1) get environment variables
    const key_var = 'TEXT_ANALYTICS_SUBSCRIPTION_KEY';
    const endpoint_var = 'TEXT_ANALYTICS_ENDPOINT';

    if (!process.env[key_var]) {
        throw new Error('please set/export the following environment variable: ' + key_var);
    }
    const subscription_key = process.env[key_var];
    if (!process.env[endpoint_var]) {
        throw new Error('please set/export the following environment variable: ' + endpoint_var);
    }
    const endpoint = process.env[endpoint_var];
    const language_endpoint = endpoint+"/text/analytics/v2.1/languages";

    // 2) setup text analytics client
    const creds = new CognitiveServicesCredentials.ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': subscription_key } });
    const textAnalyticsClient = new TextAnalyticsAPIClient.TextAnalyticsClient(creds, endpoint);

    // 3) detect message language
    if (methodType == "restapi") {
        letterToSanta.language = await languageDetection(language_endpoint, subscription_key, letterToSanta.message);
    } else {
        letterToSanta.language = await languageDetectionClient(textAnalyticsClient, letterToSanta.message);
    }

    // 4) send for sentiment analysis
    letterToSanta.sentiment = await sentimentAnalysis(textAnalyticsClient, letterToSanta.message, letterToSanta.language);


    if (letterToSanta) {
        context.res = {
            // status: 200, /* Defaults to 200 */
            body: letterToSanta
        };
    }
    else {
        context.res = {
            status: 400,
            body: "Please process letter manually"
        };
    }
};

async function languageDetection(language_endpoint: string, subscription_key: string, document: string):Promise<string> {
    let documentInput = { "documents" : [ { id: "1", text: document } ]};

    var options = {
        uri: language_endpoint,
        headers: {
            'Ocp-Apim-Subscription-Key': subscription_key,
            'Content-Type': 'application/json'
        },
        body: documentInput,
        json: true,
        simple: false
    };
    var languageResult = await rpn.post(options);

    return languageResult.documents[0].detectedLanguages[0].iso6391Name;
}

async function languageDetectionClient(client: TextAnalyticsAPIClient.TextAnalyticsClient, document: string): Promise<string> {
    const languageInput = {
        documents: [
            { id: "1", text: document }
        ]
    };

    const languageResult = await client.detectLanguage({
        languageBatchInput: languageInput
    });

    return languageResult.documents[0].detectedLanguages[0].iso6391Name;
}

async function sentimentAnalysis(client, document: string, language: string):Promise<number> {
    const documentInput = 
            { id: "1", text: document, language: language };
    const sentimentInput =
        { documents: [ documentInput ]};

    const sentimentResult = await client.sentiment({
        multiLanguageBatchInput: sentimentInput
    });
    let scoreReturn = sentimentResult.documents[0].score;

    return scoreReturn;
}

class LetterToSanta {
    public who: string;
    public message: string;
    public language: string;
    public sentiment: number;
    public giftList: [string];

    constructor(newWho: string, newMessage: string) {
        this.who = newWho;
        this.message = newMessage;
    }
}

export default httpTrigger;
