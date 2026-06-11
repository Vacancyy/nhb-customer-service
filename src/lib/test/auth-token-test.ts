import {
    generateToken,
    parseToken,
} from '../auth-token';

const url = "https://ai-stage.njzhyl.cn/nhb-customer-service/web/app/chat?channel=wdnj&token=";


console.log("320481718052065283" ,"已实名（吴超）" + url+generateToken('320481718052065283'));
console.log("320481718052065284" ,"新用户需要实名" + url+generateToken('320481718052065284'));

