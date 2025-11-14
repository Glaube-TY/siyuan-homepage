
// export async function getZhihuHOTList(plugin) {
//     const response = await plugin.client.forwardProxy({
//         url: 'https://www.zhihu.com/hot',
//         method: 'GET',
//         headers: [
//             {
//                 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
//             }
//         ],
//         contentType: 'text/html',
//         payloadEncoding: 'text',
//         responseEncoding: 'text',
//         timeout: 7000,
//         payload: undefined
//     });

//     // 调试：打印完整的响应结构
//     console.log("完整响应:", response);
    
//     if (response.code !== 0) {
//         console.error("请求失败", response);
//         return null;
//     }

//     const body = response.data.body;
//     // 调试：打印数据结构
//     console.log("数据结构:", body);

//     return body;
// }
