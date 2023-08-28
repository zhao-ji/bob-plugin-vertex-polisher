//@ts-check

var lang = require("./lang.js");
var HttpErrorCodes = {
    "400": "Bad Request",
    "401": "Unauthorized",
    "402": "Payment Required",
    "403": "Forbidden",
    "404": "Not Found",
    "405": "Method Not Allowed",
    "406": "Not Acceptable",
    "407": "Proxy Authentication Required",
    "408": "Request Timeout",
    "409": "Conflict",
    "410": "Gone",
    "411": "Length Required",
    "412": "Precondition Failed",
    "413": "Payload Too Large",
    "414": "URI Too Long",
    "415": "Unsupported Media Type",
    "416": "Range Not Satisfiable",
    "417": "Expectation Failed",
    "418": "I'm a teapot",
    "421": "Misdirected Request",
    "422": "Unprocessable Entity",
    "423": "Locked",
    "424": "Failed Dependency",
    "425": "Too Early",
    "426": "Upgrade Required",
    "428": "Precondition Required",
    "429": "请求过于频繁，请慢一点。OpenAI 对您在 API 上的请求实施速率限制。这些限制适用于每分钟 tokens 数、每分钟请求数（某些情况下是每天请求数）。访问 https://platform.openai.com/account/rate-limits 了解更多信息，或参考 OpenAI 模型的默认速率限制",
    "431": "Request Header Fields Too Large",
    "451": "Unavailable For Legal Reasons",
    "500": "Internal Server Error",
    "501": "Not Implemented",
    "502": "Bad Gateway",
    "503": "Service Unavailable",
    "504": "Gateway Timeout",
    "505": "HTTP Version Not Supported",
    "506": "Variant Also Negotiates",
    "507": "Insufficient Storage",
    "508": "Loop Detected",
    "510": "Not Extended",
    "511": "Network Authentication Required"
};

/**
 * @param {string}  url
 * @returns {string} 
*/
function ensureHttpsAndNoTrailingSlash(url) {
    const hasProtocol = /^[a-z]+:\/\//i.test(url);
    const modifiedUrl = hasProtocol ? url : 'https://' + url;

    return modifiedUrl.endsWith('/') ? modifiedUrl.slice(0, -1) : modifiedUrl;
}

/**
 * @param {string} basePrompt
 * @param {"simplicity" | "detailed"} polishingMode
 * @param {Bob.TranslateQuery} query
 * @returns {string}
 */
function generateSystemPrompt(basePrompt, polishingMode, query) {
    const isDetailedPolishingMode = polishingMode === "detailed";
    const languageMapping = {
        "zh-Hant": {
            prompt: "潤色此句",
            detailed: "。請列出修改項目，並簡述修改原因",
        },
        "zh-Hans": {
            prompt: "润色此句",
            detailed: "。请注意要列出更改以及简要解释一下为什么这么修改",
        },
        "ja": {
            prompt: "この文章を装飾する",
            detailed: "。変更点をリストアップし、なぜそのように変更したかを簡単に説明することに注意してください",
        },
        "ru": {
            prompt: "Переформулируйте следующие предложения, чтобы они стали более ясными, краткими и связными",
            detailed:
            ". Пожалуйста, обратите внимание на необходимость перечисления изменений и краткого объяснения причин таких изменений",
        },
        "wyw": {
            prompt: "润色此句古文",
            detailed: "。请注意要列出更改以及简要解释一下为什么这么修改",
        },
        "yue": {
            prompt: "潤色呢句粵語",
            detailed: "。記住要列出修改嘅內容同簡單解釋下點解要做呢啲更改",
        },
    };

    const defaultMessage =
        "Revise the following sentences to make them more clear, concise, and coherent.";
    let systemPrompt = basePrompt || defaultMessage;

    if (isDetailedPolishingMode) {
        systemPrompt += ". Please note that you need to list the changes and briefly explain why";
    }

    if (Object.prototype.hasOwnProperty.call(languageMapping, query.detectFrom)) {
        systemPrompt = basePrompt || languageMapping[query.detectFrom].prompt;
        if (isDetailedPolishingMode) {
        systemPrompt += languageMapping[query.detectFrom].detailed;
        }
    }

    return systemPrompt;
}

/**
 * @param {string} prompt
 * @param {Bob.TranslateQuery} query
 * @returns {string}
*/
function replacePromptKeywords(prompt, query) {
    if (!prompt) return prompt;
    return prompt.replace("$text", query.text)
        .replace("$sourceLang", query.detectFrom)
        .replace("$targetLang", query.detectTo);
}

/**
 * @returns {{
*   "Content-Type": string;
* }} The header object.
*/
function buildHeader() {
    return {
        "Content-Type": "application/json",
    };
}

/**
 * @param {Bob.TranslateQuery} query
 * @returns {{ 
 *  temperature: number;
 *  candidate_count: number;
 *  top_k: number;
 *  top_p: number;
 *  max_output_tokens: number;
 *  frequency_penalty: number;
 *  presence_penalty: number;
 *  stop_sequences: string[];
 *  safety_settings?: {
 *    threshold: number;
 *    category: string;
 *  }[];
 *  prompt?: {
 *      text: string;
 *  };
 * }}
*/
function buildRequestBody(query) {
    const { customSystemPrompt, customUserPrompt, polishingMode } = $option;
    
    const defaultMessage = "Rewrite the following sentence to fix grammar issues and to be more clear and enthusiastic.\n\nPlease note that you need to list the changes and briefly explain why\ninput: There going to love opening they'\''re present\noutput: They'\''re going to be so excited to open their presents!\n\nChanges and Explanation:\n1. Changed \"There\" to \"They'\''re\": The correct contraction for '\''they are'\'' is '\''they'\''re'\'', not '\''there'\''.\n2. Changed \"they'\''re\" to \"their\": In this context, the possessive pronoun '\''their'\'' should be used instead of the contraction '\''they'\''re'\''.\ninput: $text\noutput:";
    const promptString = replacePromptKeywords(defaultMessage, query);

    return {
      // optional, 0.0 always uses the highest-probability result
      temperature: 0.2,
      // optional, how many candidate results to generate
      candidate_count: 1,
      // optional, number of most probable tokens to consider for generation
      top_k: 40,
      // optional, for nucleus sampling decoding strategy
      top_p: 0.95,
      // optional, maximum number of output tokens to generate
      max_output_tokens: 1024,
      // optional, sequences at which to stop model generation
      stop_sequences: [],
      // optional, safety settings
      safety_settings: [{"category":"HARM_CATEGORY_DEROGATORY","threshold":4},{"category":"HARM_CATEGORY_TOXICITY","threshold":4},{"category":"HARM_CATEGORY_VIOLENCE","threshold":4},{"category":"HARM_CATEGORY_SEXUAL","threshold":4},{"category":"HARM_CATEGORY_MEDICAL","threshold":4},{"category":"HARM_CATEGORY_DANGEROUS","threshold":4}],
      prompt: {
          text: promptString
      },
    };
}

/**
 * @param {Bob.TranslateQuery} query
 * @param {Bob.HttpResponse} result
 * @returns {void}
*/
function handleError(query, result) {
    const { statusCode } = result.response;
    const reason = (statusCode >= 400 && statusCode < 500) ? "param" : "api";
    query.onCompletion({
        error: {
            type: reason,
            message: `接口响应错误 - ${HttpErrorCodes[statusCode]}`,
            addtion: JSON.stringify(result),
        },
    });
}

/**
 * @param {Bob.TranslateQuery} query
 * @param {Bob.HttpResponse.data} result
 * @returns {string}
*/
function handleResponse(query, result) {
    try {
        // const dataObj = JSON.parse(result);
        const { candidates } = result;
        if (!candidates || candidates.length === 0) {
            query.onCompletion({
                error: {
                    type: "api",
                    message: "接口未返回结果",
                    addtion: "",
                },
            });
        }

        const content = candidates[0].output;
        if (content !== undefined) {
            return content;
        }
    } catch (err) {
        query.onCompletion({
            error: {
                type: err._type || "param",
                message: err._message || "Failed to parse JSON",
                addtion: err._addition,
            },
        });
    }
}

/**
 * @type {Bob.Translate}
 */
function translate(query, completion) {
    if (!lang.langMap.get(query.detectTo)) {
        completion({
            error: {
                type: "unsupportLanguage",
                message: "不支持该语种",
                addtion: "不支持该语种",
            },
        });
    }

    const { model, apiUrl } = $option;

    const modifiedApiUrl = ensureHttpsAndNoTrailingSlash(apiUrl || "https://vertex.minganci.org/v1beta2/models/text-bison-001:generateText");
    
    const header = buildHeader()
    const body = buildRequestBody(query);
    (async () => {
        await $http.post({
            url: modifiedApiUrl,
            method: "POST",
            body: body,
            header: header,
            handler: (result) => {
                if (result.response.statusCode >= 400) {
                    handleError(query, result);
                } else {
                    const content = handleResponse(query, result.data);
                    query.onCompletion({
                        result: {
                            from: query.detectFrom,
                            to: query.detectTo,
                            toParagraphs: [content],
                        },
                    });
                }
            }
        });
    })().catch((err) => {
        completion({
            error: {
                type: err._type || "unknown",
                message: err._message || "未知错误",
                addtion: err._addition,
            },
        });
    });
}

function supportLanguages() {
    return lang.supportLanguages.map(([standardLang]) => standardLang);
}

exports.supportLanguages = supportLanguages;
exports.translate = translate;
