import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    user_id!: number;

    @Column({ type: 'varchar', nullable: false })
    user_name!: string;

    @Column({ type: 'varchar', nullable: false })
    nickname!: string;

    @Column({ type: 'varchar', nullable: false })
    email!: string;

    @Column({ type: 'varchar', nullable: false })
    password!: string;

    @Column({ type: 'boolean', default: false })
    login_type: boolean = false;

    @Column({ type: 'boolean', default: false })
    is_mentor: boolean = false;
    update_at!: Date;

    @Column({ type: 'varchar', nullable: false })
    interest_univ!: string;

    @Column({ type: 'varchar', nullable: true })
    interest_type?: string;

    @Column({ type: 'varchar', nullable: false })
    course!: string;

    @Column({ type: 'varchar', nullable: true })
    profile_image?: string;

    @Column({ type: 'varchar', nullable: false })
    belong_to!: string;

    @Column({ type: 'simple-array', nullable: true })
    favorite?: string[];
}
