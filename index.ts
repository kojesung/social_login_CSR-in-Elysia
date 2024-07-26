import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import dotenv from 'dotenv';

dotenv.config();
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;

if (!accessTokenSecret || !refreshTokenSecret) {
    throw new Error('ACCESS_TOKEN_SECRET or REFRESH_TOKEN_SECRET is not defined');
}

// auth/google을 통한 로그인할 때 필요한 body내용
interface LoginRequestBody {
    userInfo: {
        id: string;
        name: string;
        email: string;
    };
}

interface TokenRequestBody {
    refreshToken: string;
}

const app = new Elysia()
    .use(
        jwt({
            name: 'jwt',
            secret: accessTokenSecret, // Access Token의 비밀 키
            exp: '15m', // Access Token의 만료 시간 (15분)
        })
    )
    .use(
        jwt({
            name: 'refreshJwt',
            secret: refreshTokenSecret, // Refresh Token의 비밀 키
            exp: '7d', // Refresh Token의 만료 시간 (7일)
        })
    );

// 전역 users 배열(데이터베이스라고 가정)
const users = [
    {
        id: '1',
        name: '고제성',
        email: 'js95112345@gmail.com',
        gender: 'male',
        age: 23,
    },
    {
        id: '2',
        name: '이름1',
        email: '이메일1',
        gender: 'female',
        age: 25,
    },
];

// 임시로 만든 데이터베이스 조회 함수
// 유저를 이메일로 찾는 함수
const findUserByEmail = async (email: string) => {
    return users.find((user) => user.email === email) || null;
};

// 새로운 유저를 추가하는 함수
const addUser = async (userInfo: { id: string; name: string; email: string }) => {
    const newUser = {
        id: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        gender: 'unknown', // 기본값, 프론트엔드에서 제공하지 않은 경우
        age: 0, // 기본값, 프론트엔드에서 제공하지 않은 경우
    };
    users.push(newUser); // 전역 users 배열에 새로운 유저 추가
    console.log('New user added:', newUser);
    return newUser;
};

//userInfo를 토대로 토큰을 만들어주는 함수
//"/auth/google"에서 사용됨
const createTokensForUser = async (userInfo: { id: string; name: string; email: string }, jwt, refreshJwt) => {
    const payload = {
        sub: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
    };
    //"/auth/google"에서 userInfo에 id, name, email을 담아서 넣어줄건데 이를 기준으로 토큰 생성

    const accessToken = await jwt.sign(payload);
    const refreshToken = await refreshJwt.sign(payload);
    return { accessToken, refreshToken };
};

//기존 회원 로그인 또는 신규 회원 가입
app.post('/auth', async ({ jwt, refreshJwt, body, set, cookie: { auth, refreshAuth } }) => {
    //cookie도 호출함
    const { userInfo } = body as LoginRequestBody;

    // accessToken 검증 (선택 사항: 필요에 따라 소셜 로그인 제공자에게 검증 요청)
    /*
    const tokenInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
    const tokenInfo = await tokenInfoResponse.json();

    if (tokenInfo.error) {
        set.status = 401;
        return 'Invalid access token';
    }
    */

    // 유저 정보 기반으로 데이터베이스에서 유저 찾기
    // 여기서는 유저 이름은 겹칠 수 있으니 email을 통해 찾는다고 가정
    const user = await findUserByEmail(userInfo.email);

    let newUser = user;
    if (!user) {
        // 유저가 존재하지 않으면 새로운 유저 등록
        newUser = await addUser(userInfo);
    }

    // 유저 정보 기반으로 토큰 생성
    const { accessToken: newAccessToken, refreshToken } = await createTokensForUser(userInfo, jwt, refreshJwt);

    //Elysia에서는 cookie부르기만 하면 호출되어서 설정 가능
    // 토큰을 쿠키에 설정
    auth.set({
        value: newAccessToken,
        httpOnly: true,
        maxAge: 15 * 60, // 15 minutes
        path: '/',
    });

    refreshAuth.set({
        value: refreshToken,
        httpOnly: true,
        maxAge: 7 * 86400, // 7 days
        path: '/',
    });

    // 유저의 추가 정보를 반환
    return { accessToken: newAccessToken, refreshToken, user: { gender: user.gender, age: user.age } };
});

app.post('/token', async ({ jwt, refreshJwt, body, set }) => {
    // 새로운 토큰 발급하는 API
    // refreshToken을 통해 accessToken재발급 해주는 API
    const { refreshToken } = body as TokenRequestBody;

    if (!refreshToken) {
        set.status = 401;
        return 'refreshToken이 제공되지 않았음';
    }

    try {
        const user = await refreshJwt.verify(refreshToken); //refreshToken 검증 결과로 반환된 user
        if (!user) {
            set.status = 403;
            return '유효하지 않은 refreshToken';
        }
        const newAccessToken = await jwt.sign(user); //user를 통해 새로운 accessToken발급
        return { accessToken: newAccessToken, sub: user.sub, name: user.name, email: user.email };
    } catch (err) {
        //refreshToken 검증 결과가 안 나온다면 403에러 반환
        set.status = 403;
        return '유효하지 않은 refreshToken';
    }
});

//헤더로 받는 accessToken이 유효한지 검증하는 API
app.get('/protected', async ({ jwt, set, cookie: { auth } }) => {
    try {
        const profile = await jwt.verify(auth.value);
        if (!profile) {
            set.status = 401;
            return 'Unauthorized';
        }
        return `Hello ${profile.name}`;
    } catch (err) {
        set.status = 401;
        return 'Unauthorized';
    }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
