import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from './domain/User';

dotenv.config();
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;

if (!accessTokenSecret || !refreshTokenSecret) {
    throw new Error('ACCESS_TOKEN_SECRET or REFRESH_TOKEN_SECRET is not defined');
}

const app = new Elysia()
    .use(
        jwt({
            name: 'jwt',
            secret: accessTokenSecret,
            exp: '15m',
        })
    )
    .use(
        jwt({
            name: 'refreshJwt',
            secret: refreshTokenSecret,
            exp: '7d',
        })
    );
// 타입 정의(여기에 첫 가입하는 회원이라면 추가로 제공할 정보 추가)
// name만 제공하면 중복될 수 있으니 이메일 포함
interface LoginRequestBody {
    userInfo: {
        name: string;
        email: string;
    };
}

interface TokenRequestBody {
    refreshToken: string;
}

// 데이터베이스 연결 설정
const AppDataSource = new DataSource({
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: '',
    password: '',
    database: '',
    synchronize: true,
    logging: true,
    entities: [User],
});

AppDataSource.initialize()
    .then(async () => {
        console.log('Database connected');

        const userRepository = AppDataSource.getRepository(User);

        // 이메일로 사용자 찾기 함수
        const findUserByEmail = async (email: string) => {
            console.log(`Finding user by email: ${email}`);
            const user = await userRepository.findOne({ where: { email } });
            console.log(`User found: ${user}`);
            return user;
        };

        // 새로운 사용자 추가 함수
        const addUser = async (userInfo: { name: string; email: string }) => {
            console.log(`Adding new user: ${JSON.stringify(userInfo)}`);
            const newUser = new User();
            newUser.user_name = userInfo.name;
            newUser.email = userInfo.email;
            newUser.password = ''; // 필요한지 모르겠지만 erd에 있으니
            newUser.nickname = ''; // 기본값
            newUser.interest_univ = ''; // 기본값
            newUser.course = ''; // 기본값
            newUser.belong_to = ''; // 기본값

            try {
                await userRepository.save(newUser);
                console.log('New user added:', newUser);
            } catch (error) {
                console.error('Error adding new user:', error);
            }

            return newUser;
        };

        // userInfo를 토대로 토큰을 만들어주는 함수
        const createTokensForUser = async (userInfo: { name: string; email: string }, jwt, refreshJwt) => {
            const payload = {
                name: userInfo.name,
                email: userInfo.email,
            };

            const accessToken = await jwt.sign(payload);
            const refreshToken = await refreshJwt.sign(payload);
            return { accessToken, refreshToken };
        };

        app.post('/auth', async ({ jwt, refreshJwt, body, set, cookie: { auth, refreshAuth } }) => {
            const { userInfo } = body as LoginRequestBody;

            let user = await findUserByEmail(userInfo.email);

            if (!user) {
                user = await addUser(userInfo);
            }

            const { accessToken: newAccessToken, refreshToken } = await createTokensForUser(userInfo, jwt, refreshJwt);

            auth.set({
                value: newAccessToken,
                httpOnly: true,
                maxAge: 15 * 60, // accessToken은 15분
                path: '/',
            });

            refreshAuth.set({
                value: refreshToken,
                httpOnly: true,
                maxAge: 7 * 86400, // refreshToken은 7일
                path: '/',
            });

            return { accessToken: newAccessToken, refreshToken, user };
        });

        app.post('/token', async ({ jwt, refreshJwt, body, set }) => {
            const { refreshToken } = body as TokenRequestBody;

            if (!refreshToken) {
                set.status = 401;
                return 'refreshToken이 제공되지 않았음';
            }

            try {
                const user = await refreshJwt.verify(refreshToken);
                if (!user) {
                    set.status = 403;
                    return '유효하지 않은 refreshToken';
                }
                const newAccessToken = await jwt.sign(user);
                return { accessToken: newAccessToken, sub: user.sub, name: user.name, email: user.email };
            } catch (err) {
                set.status = 403;
                return '유효하지 않은 refreshToken';
            }
        });

        app.get('/protected', async ({ jwt, set, cookie: { auth } }) => {
            const rauth = auth; //쿠키가 올바르지 않아도 이전의 쿠키를 기억해서 값 반환하는 에러 수정하기 위한 내용
            if (!rauth || !rauth.value) {
                console.log('No auth cookie found');
                set.status = 401;
                return 'Unauthorized';
            }

            const token = rauth.value;
            console.log(`Verifying token: ${token}`);
            try {
                const profile = await jwt.verify(token);
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
    })
    .catch((error) => console.log('Database connection error:', error));
