/**
 * RSA 加解密测试脚本
 * 执行方式: npx tsx src/lib/rsa.test.ts
 */

import {
  generateKeyPair,
  encrypt,
  decrypt,
  sign,
  verify,
  encryptLong,
  decryptLong,
  decryptJava,
  encryptForJava,
} from '../rsa';

console.log('=== RSA 加解密测试 ===\n');

// 1. 生成密钥对
console.log('1. 生成 RSA 密钥对...');
const { publicKey, privateKey } = generateKeyPair();
console.log('公钥 (前100字符):', publicKey.slice(0, 100) + '...');
console.log('私钥 (前100字符):', privateKey.slice(0, 100) + '...');
console.log('');

// 2. 加密解密测试
console.log('2. 加密解密测试...');
const originalText = '你好，这是需要加密的敏感数据！';
console.log('原始数据:', originalText);

const encrypted = encrypt(originalText, publicKey);
console.log('加密结果:', encrypted);

const decrypted = decrypt(encrypted, privateKey);
console.log('解密结果:', decrypted);
console.log('解密是否正确:', decrypted === originalText ? '✅ 成功' : '❌ 失败');
console.log('');

// 3. 签名验签测试
console.log('3. 签名验签测试...');
const signData = '这是需要签名的数据';
console.log('待签名数据:', signData);

const signature = sign(signData, privateKey);
console.log('签名结果:', signature);

const isValid = verify(signData, signature, publicKey);
console.log('验签结果:', isValid ? '✅ 成功' : '❌ 失败');

// 验签错误数据
const invalidVerify = verify('错误数据', signature, publicKey);
console.log('验签错误数据:', invalidVerify ? '❌ 异常' : '✅ 正确拒绝');
console.log('');

// 4. 长数据分段加密测试
console.log('4. 长数据分段加密测试...');
const longText = '这是一段很长的数据，需要分段加密。'.repeat(10);
console.log('原始数据长度:', longText.length, '字符');

const longEncrypted = encryptLong(longText, publicKey);
console.log('分段加密结果 (前50字符):', longEncrypted.slice(0, 50) + '...');

const longDecrypted = decryptLong(longEncrypted, privateKey);
console.log('分段解密结果长度:', longDecrypted.length, '字符');
console.log('分段解密是否正确:', longDecrypted === longText ? '✅ 成功' : '❌ 失败');
console.log('');

// 5. Java/Hutool PKCS#1 加密解密测试
console.log('5. Java/Hutool PKCS#1 加密解密测试...');
const javaPrivateKey = 'MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAKKx9d7hn7iHTQ4rxk+T4S95xBNPU+ZWPzomC7BbZYAxciw4NmYZcsKR9ErfchSpKbl+8jL1pic/gvbJWjszjpQXuISCOTfOmGCQlSN0qLJmBbvaMEXxD+TaQdMFsV7VLPXe5Xc9mPQnUiOL285b1VoOlDfQaU+6ci3VN2gwDmq5AgMBAAECgYAXv14iIFDOAIHQ1bbmmrE92sox/1xBvMkR1cfTACQ6p/0AU1wtXv2PRPqhiyf9uAttFgiIQ67y/6RAHXfcOFRRMXajM8XaUSj3V+5EttALKumltBl6UR5n5GLoPwyX59NPl7BBSHSqO6tU2t/EqtlU+w3A5/Vlkiy/+q1UdWnBmQJBAOar0BQbs0HgR+dPsBFI8cKRiAclsaaczEv9yhaYzN3hWa36Guq1PVN97LKkEQGo6sRcnEw0PPl+qedWIMy6OVcCQQC0j1YcoA7Fr8lsX2RfclNRs+DRMJ92DSlJhV6SXzHhlgXD2ANL02y+KfGjTbJBqPyv5Bzjk7bdyp6nCL+UniJvAkEAjmhMEd34ERdxzLA5trId700BecgfoQj0Z4XLGaBD+keBohLiQzyZG86GLtNzXF74cTnrlHA7pJw6MIPPxBTECQJALsJf/pHEwZVAiHw7tiwZP7NhqUr6QMwvwQZ081sLw+viGlG6qMxcAPNDzJK2cyKcLcDZamY6mT170K4HTymUqQJBAOVc8WG44X9NyZdYeSwlp7r1ZJDDs+ypeesQILXFamZQwKjxt/Q9oew7YVCpuluDvzZoIYUgKdrUfMAsmrpwpE4=';

// 注意：这个私钥是 1024 位，加密数据需要对应 1024 位公钥加密
console.log('Java 私钥格式: PKCS#1 (1024位)');
console.log('提示: 解密需要用对应公钥加密的数据');
console.log('');

// 测试 node-rsa 加密解密（自测）
console.log('5.1 node-rsa 自测...');
const testText = '测试 Java 兼容加密';
const encryptedForJava = encryptForJava(testText, publicKey);
console.log('加密结果:', encryptedForJava);
const decryptedFromJava = decryptJava(encryptedForJava, privateKey);
console.log('解密结果:', decryptedFromJava);
console.log('自测结果:', decryptedFromJava === testText ? '✅ 成功' : '❌ 失败');
console.log('');

console.log('=== 测试完成 ===');

console.log(decryptJava("AMXi8oQECi6MXkABCE8yu24VJAMmgLRkHc9tHEkogbcKUUg2wnqxXHiwcozAkvaXz9Pqpi2hMggt1X80rwZnui1Sfk+t2FLPRaHrVrTkR0TOmfPFdptpBZwU36VUuZeYhz8y9DeRUqidI7rfLPnHkK4mw5KAVo8W8X7mmn7Od6dy1oToSwac2jHfwYZnpOzK6xbnh7DLNJsPGXnQbpYCZuWDpWpluKvuUKjXEdAofsUny4qN25EPhZ8oA68jevOI7UvnMJLaYtRXaR/MR1KLlNuzHihXuzboG0AQpLIZG32bXEfVmLmmm4aXHIm3HjAWk9NvqtjSQeoizGPT/ctcwx5hTZ0T/o/dxx1eLucN3fGn+Y2LV5RXQ6f5fJu+SJ0yQA0nojJgInMVq+0skcbwKseJWWS+zeknuwMUSSi/CcbXPcFodzFl9lmxjgsdMuEnGpe3k5N3EBTJvRrMyL9yedTCzgcV3g/lnfVVWxaM+Wsz/Ja7lzYJjyRSudOady6oLG0eU27+Qq5meed5XH7fuYdS2vk+yJBGSvim7eFu3ArtI4iBZE0Hj8gxtm0YMYTDwKDY9xI8Ix1Z3SAHmhwZKNN12mYYTHNttl58HC+T5MRVhalR5aMeL5OtA8mGJVGDmsUAecFAX/fCXt6j7fXg1ixnIKQYapvH158wfRmV4oM+ZxxgQBMdKgaM6+kbvzMgV96Gf/oi9wHaF0iyN01d7Dzdw9hsp8RXdhnpZh2nPg5yI02wFZ3z0VtkMp9osHdJv/X3ohOHlD726JrUdr31qAgWsswZnysaYS7cG4SZPrPZLPpTgmxpdZ9OYU6kCf4lxsAGRmMBuIMf0wPDMo/M0w==",
    "MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAKKx9d7hn7iHTQ4rxk+T4S95xBNPU+ZWPzomC7BbZYAxciw4NmYZcsKR9ErfchSpKbl+8jL1pic/gvbJWjszjpQXuISCOTfOmGCQlSN0qLJmBbvaMEXxD+TaQdMFsV7VLPXe5Xc9mPQnUiOL285b1VoOlDfQaU+6ci3VN2gwDmq5AgMBAAECgYAXv14iIFDOAIHQ1bbmmrE92sox/1xBvMkR1cfTACQ6p/0AU1wtXv2PRPqhiyf9uAttFgiIQ67y/6RAHXfcOFRRMXajM8XaUSj3V+5EttALKumltBl6UR5n5GLoPwyX59NPl7BBSHSqO6tU2t/EqtlU+w3A5/Vlkiy/+q1UdWnBmQJBAOar0BQbs0HgR+dPsBFI8cKRiAclsaaczEv9yhaYzN3hWa36Guq1PVN97LKkEQGo6sRcnEw0PPl+qedWIMy6OVcCQQC0j1YcoA7Fr8lsX2RfclNRs+DRMJ92DSlJhV6SXzHhlgXD2ANL02y+KfGjTbJBqPyv5Bzjk7bdyp6nCL+UniJvAkEAjmhMEd34ERdxzLA5trId700BecgfoQj0Z4XLGaBD+keBohLiQzyZG86GLtNzXF74cTnrlHA7pJw6MIPPxBTECQJALsJf/pHEwZVAiHw7tiwZP7NhqUr6QMwvwQZ081sLw+viGlG6qMxcAPNDzJK2cyKcLcDZamY6mT170K4HTymUqQJBAOVc8WG44X9NyZdYeSwlp7r1ZJDDs+ypeesQILXFamZQwKjxt/Q9oew7YVCpuluDvzZoIYUgKdrUfMAsmrpwpE4="));


